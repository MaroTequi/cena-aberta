package br.com.cenaaberta;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.function.Executable;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;

/** Testes de caracterização do Catalog: fixam o comportamento atual (modo demo e TMDB falso). */
class CatalogTest {
 static final String SECRET="x".repeat(24);
 JdbcTemplate db;HttpServer tmdb;volatile int status;volatile String body;
 Catalog catalog;

 @BeforeEach void setup() throws Exception {
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__catalog.sql"),new ClassPathResource("db/migration/V2__title_details.sql"),new ClassPathResource("db/migration/V3__title_genre_ids.sql")).execute(source);
 db=new JdbcTemplate(source);
 status=200;body="{}";
 tmdb=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
 tmdb.createContext("/",exchange->{
 byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
 exchange.getResponseHeaders().add("Content-Type","application/json");
 exchange.sendResponseHeaders(status,bytes.length==0?-1:bytes.length);
 if(bytes.length>0)exchange.getResponseBody().write(bytes);
 exchange.close();
 });
 tmdb.start();
 catalog=demo();
 }
 @AfterEach void teardown(){tmdb.stop(0);}

 Catalog demo(){return new Catalog(db,new ObjectMapper(),SECRET,"","http://127.0.0.1:"+tmdb.getAddress().getPort());}
 Catalog remote(){return new Catalog(db,new ObjectMapper(),SECRET,"fake","http://127.0.0.1:"+tmdb.getAddress().getPort());}
 @SuppressWarnings("unchecked") static List<Catalog.Title> items(Map<String,Object> result){return (List<Catalog.Title>)result.get("items");}

 @Test void rejectsInvalidSearchParameters(){
 for(var call:List.<Executable>of(
 ()->catalog.titles("","all",0),()->catalog.titles("","all",501),
 ()->catalog.titles("a".repeat(101),"all",1),()->catalog.titles("","x",1)))
 assertEquals(400,assertThrows(ResponseStatusException.class,call).getStatusCode().value());
 }
 @Test void constructorRejectsShortSecret(){
 assertThrows(IllegalArgumentException.class,()->new Catalog(db,new ObjectMapper(),"x".repeat(23),"","http://127.0.0.1:1"));
 }
 @Test void demoSearchIgnoresAccentsAndPagesBeyondOneAreEmpty(){
 var first=catalog.titles("ultimo","all",1);
 assertTrue(items(first).stream().anyMatch(t->t.id().equals("demo-ultimo-rolo")));
 assertEquals(true,first.get("demo"));
 assertTrue(items(catalog.titles("ultimo","all",2)).isEmpty());
 }
 @Test void demoAnimeFilterReturnsOnlyAnime(){
 var found=items(catalog.titles("","anime",1));
 assertFalse(found.isEmpty());
 assertTrue(found.stream().allMatch(Catalog.Title::anime));
 }
 @Test void demoDetailIncludesDetails(){
 assertNotNull(catalog.detail("demo-ultimo-rolo").details());
 }
 @Test void remoteSearchStoresSummary(){
 body="""
 {"results":[{"id":603,"title":"Matrix","original_title":"The Matrix","release_date":"1999-03-31",
 "overview":"x","poster_path":"/abc.jpg","genre_ids":[28],"original_language":"en"}],"total_pages":1}""";
 var result=remote().titles("matrix","movie",1);
 assertEquals(1,items(result).size());
 assertEquals("tmdb-movie-603",items(result).getFirst().id());
 assertEquals(false,result.get("demo"));
 assertEquals(1,db.queryForObject("select count(*) from title where id='tmdb-movie-603'",Integer.class));
 }
 @Test void remoteFailuresBecome503WithPortugueseMessage(){
 var service=remote();
 Map<Integer,String> expected=Map.of(401,"O acesso ao TMDB precisa ser configurado.",
 429,"O TMDB limitou as consultas. Tente novamente em instantes.",500,"Catálogo externo indisponível.");
 for(var entry:expected.entrySet()){
 status=entry.getKey();body="{}";
 var failure=assertThrows(ResponseStatusException.class,()->service.titles("matrix","movie",1));
 assertEquals(503,failure.getStatusCode().value());
 assertEquals(entry.getValue(),failure.getReason());
 }
 status=404;
 assertEquals(404,assertThrows(ResponseStatusException.class,()->service.detail("tmdb-movie-1")).getStatusCode().value());
 }
 @Test void batchWithoutDetailsFlagKeepsDetailsNull(){
 assertNull(catalog.batch(List.of("demo-ultimo-rolo"),0,null,false).getFirst().details());
 }
 @Test void batchWithDetailsUsesFixturesStoredJsonAndGenreFallback(){
 db.update("insert into title(id,format,anime,name,original,release_year,summary,poster,details) values('tmdb-movie-10','movie',false,'Dez','Dez','2001','',null,?)",
 "{\"genres\":[\"Crime\"],\"runtime\":120,\"seasons\":null,\"episodes\":null,\"directors\":[],\"creators\":[],\"cast\":[]}");
 db.update("insert into title(id,format,anime,name,original,release_year,summary,poster,genre_ids) values('tmdb-movie-11','movie',false,'Onze','Onze','2002','',null,'28,99999')");
 var found=catalog.batch(List.of("demo-ultimo-rolo","tmdb-movie-10","tmdb-movie-11","tmdb-movie-12"),0,null,true);
 assertEquals(3,found.size());
 var byId=new HashMap<String,Catalog.Title>();for(var t:found)byId.put(t.id(),t);
 assertEquals(96,byId.get("demo-ultimo-rolo").details().runtime());
 assertEquals(List.of("Crime"),byId.get("tmdb-movie-10").details().genres());
 assertEquals(120,byId.get("tmdb-movie-10").details().runtime());
 assertEquals(List.of("Ação"),byId.get("tmdb-movie-11").details().genres());
 assertNull(byId.get("tmdb-movie-11").details().runtime());
 }
 @Test void batchWithDetailsFetchesMissingDetailsFromTmdbAndToleratesFailure(){
 db.update("insert into title(id,format,anime,name,original,release_year,summary,poster,genre_ids) values('tmdb-movie-603','movie',false,'Matrix','Matrix','1999','',null,'28')");
 body="""
 {"id":603,"title":"Matrix","original_title":"The Matrix","release_date":"1999-03-31","overview":"x","runtime":136,
 "genres":[{"id":28,"name":"Ação"}],"original_language":"en","credits":{"cast":[],"crew":[]}}""";
 assertEquals(136,remote().batch(List.of("tmdb-movie-603"),0,null,true).getFirst().details().runtime());
 db.update("update title set details=null");
 status=500;
 var fallback=remote().batch(List.of("tmdb-movie-603"),0,null,true).getFirst().details();
 assertEquals(List.of("Ação"),fallback.genres());
 assertNull(fallback.runtime());
 }
}
