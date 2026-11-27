package br.com.cenaaberta;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
import java.net.InetSocketAddress;
import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
class LetterboxdImportTest {
 byte[] zip(Map<String,String> files)throws Exception{
  var output=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(output)){for(var file:files.entrySet()){zip.putNextEntry(new ZipEntry(file.getKey()));zip.write(file.getValue().getBytes(StandardCharsets.UTF_8));zip.closeEntry();}}return output.toByteArray();
 }
 @Test void readsQuotedCsvDiaryListPreambleAndIgnoresDeleted()throws Exception{
  var files=new LinkedHashMap<String,String>();
  files.put("reviews.csv","Date,Name,Year,Rating,Review\n2025-01-01,Movie,2024,4.5,\"Good, indeed!\nSecond line <b>bold</b>\"\n");
  files.put("diary.csv","Name,Year,Watched Date,Rewatch\nMovie,2024,2025-02-01,Yes\n");
  files.put("lists/favorites.csv","Letterboxd list export v7\nDate,Name,Description\n2025-01-01,Favorites,Text\n\nPosition,Name,Year,URL\n1,Movie,2024,https://letterboxd.com/film/movie/\n");
  files.put("deleted/reviews.csv","Name,Year\nDeleted,2000\n");
  var data=LetterboxdImport.parse(new ByteArrayInputStream(zip(files)));
  var rows=(List<LetterboxdImport.Row>)data.get("rows");assertEquals(2,rows.size());
  assertEquals(9,rows.get(0).rating());assertEquals("Good, indeed!\nSecond line bold",rows.get(0).review());
  assertTrue(rows.get(1).rewatch());assertEquals("2025-02-01",rows.get(1).date());
 }
 @Test void rejectsInvalidRatingsAndExpansionLimit()throws Exception{
  var bad=zip(Map.of("ratings.csv","Name,Year,Rating\nMovie,2024,9\n"));
  assertThrows(ResponseStatusException.class,()->LetterboxdImport.parse(new ByteArrayInputStream(bad)));
  var huge=zip(Map.of("ignored.txt","x".repeat(20_000_001)));
  assertThrows(ResponseStatusException.class,()->LetterboxdImport.parse(new ByteArrayInputStream(huge)));
 }
 @Test void fillsMissingValuesPreservesExistingAndReimportDoesNotDuplicate()throws Exception{
  var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
  var migrations=new ResourceDatabasePopulator();for(String f:List.of("V1__social.sql","V6__viewing_time.sql","V8__public_evaluations.sql","V12__letterboxd_import.sql","V27__review_publication.sql"))migrations.addScript(new ClassPathResource("db/migration/"+f));migrations.execute(source);
  var db=new JdbcTemplate(source);db.update("insert into profile(actor,username,name) values('a','test','Test')");
  db.update("insert into library(actor,title,rating,review) values('a','tmdb-movie-777',8,'Existing')");
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  server.createContext("/title-batch",e->{byte[] b="[{\"id\":\"tmdb-movie-777\",\"format\":\"movie\"}]".getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(200,b.length);e.getResponseBody().write(b);e.close();});server.start();
  try{
   var service=new LetterboxdImport(db,new ObjectMapper(),"http://127.0.0.1:"+server.getAddress().getPort(),"catalog-key");
   var rows=List.of(new LetterboxdImport.Row("diary","Movie","2024",10,"Imported","2025-01-01",false,"",1,"tmdb-movie-777"),new LetterboxdImport.Row("watchlist","Movie","2024",null,"","",false,"",1,"tmdb-movie-777"));
   assertEquals(1,service.commit("a",new LetterboxdImport.Batch(rows)).get("imported"));
   assertEquals(2,service.commit("a",new LetterboxdImport.Batch(rows)).get("skipped"));
   assertEquals(8,db.queryForObject("select rating from library",Integer.class));assertEquals("Existing",db.queryForObject("select review from library",String.class));
   assertEquals(false,db.queryForObject("select interest from library",Boolean.class));
   assertEquals(1,db.queryForObject("select count(*) from viewing",Integer.class));assertEquals(0,db.queryForObject("select count(*) from collection_item",Integer.class));
   // One native session and two same-day entries from the file.
   db.update("insert into viewing(id,actor,title,watched_on,rewatch,watched_at) values('native','a','tmdb-movie-777','2025-03-02',false,'2025-03-02T18:00:00Z')");
   var diary=new ArrayList<LetterboxdImport.Row>();
   for(int i=1;i<=2;i++)diary.add(new LetterboxdImport.Row("diary","Movie","2024",null,"","2025-03-02",i>1,"",i,"tmdb-movie-777"));
   var day=service.commit("a",new LetterboxdImport.Batch(diary));
   assertEquals(1,day.get("imported"));assertEquals(1,day.get("skipped"));
   assertEquals(1,db.queryForObject("select count(*) from viewing where id='native' and watched_at is not null and rewatch=false",Integer.class));
   assertEquals(2,db.queryForObject("select count(*) from viewing where watched_on='2025-03-02'",Integer.class));
   assertEquals(0,service.commit("a",new LetterboxdImport.Batch(diary)).get("imported"));
   var undated=new LetterboxdImport.Row("diary","Movie","2024",null,"","",false,"",1,"tmdb-movie-777");
   assertEquals(List.of(0),service.commit("a",new LetterboxdImport.Batch(List.of(undated))).get("pending"));
   db.update("update library set evaluation_public=true,review=null where actor='a'");
   var fill=new LetterboxdImport.Row("reviews","Movie","2024",2,"New review","",false,"",1,"tmdb-movie-777");
   assertEquals(List.of(0),service.commit("a",new LetterboxdImport.Batch(List.of(fill))).get("pending"));
   assertEquals(1,service.commit("a",new LetterboxdImport.Batch(List.of(fill),Set.of(0))).get("imported"));
   assertEquals(8,db.queryForObject("select rating from library",Integer.class));
   assertEquals("New review",db.queryForObject("select review from library",String.class));
   assertEquals(true,db.queryForObject("select evaluation_public from library",Boolean.class));

   var csv=new StringBuilder("Name,Year,Watched Date,Rewatch\n");
   for(int i=0;i<1001;i++)csv.append("Movie,2024,").append(java.time.LocalDate.of(2010,1,1).plusDays(i)).append(",Yes\n");
   var preview=LetterboxdImport.parse(new ByteArrayInputStream(zip(Map.of("diary.csv",csv.toString()))));
   var large=((List<LetterboxdImport.Row>)preview.get("rows")).stream().map(r->new LetterboxdImport.Row(r.kind(),r.name(),r.year(),r.rating(),r.review(),r.date(),r.rewatch(),r.list(),r.occurrence(),"tmdb-movie-777")).toList();
   for(int pass=0;pass<2;pass++){
    int added=0;for(int i=0;i<large.size();i+=30){
     var batch=new LetterboxdImport.Batch(large.subList(i,Math.min(i+30,large.size())));
     added+=(int)service.commit("a",batch).get("imported");
    }
    assertEquals(pass==0?1001:0,added);
   }
  }finally{server.stop(0);}
 }
}
