package br.com.cenaaberta;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
class LibraryTest {
 static final String ANA="ana-12345",TITLE="demo-film";
 JdbcTemplate db;Library service;
 @BeforeEach void setup(){
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V4__rewatching.sql"),new ClassPathResource("db/migration/V5__film_ranking.sql"),new ClassPathResource("db/migration/V6__viewing_time.sql"),new ClassPathResource("db/migration/V8__public_evaluations.sql"),new ClassPathResource("db/migration/V25__review_spoiler_vote.sql"),new ClassPathResource("db/migration/V27__usuario_comum.sql")).execute(source);
 db=new JdbcTemplate(source);
 db.update("insert into profile(actor,username,name) values(?,?,?)",ANA,"ana","Ana");
 var actors=new ActiveActors(db);
 var receipts=new IdempotencyReceipts(db,new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules());
 var entries=new LibraryEntries(db,id->id);
 service=new Library(db,actors,entries,new Diary(db,actors,receipts,entries));
 }
 void assertFails(HttpStatus status,String message,Runnable call){
 var e=assertThrows(ResponseStatusException.class,call::run);
 assertEquals(status,e.getStatusCode());assertEquals(message,e.getReason());
 }
 Map<String,Object> change(String action,Library.LibraryChange input){return service.library(ANA,TITLE,action,input);}
 static Library.LibraryChange value(boolean v){return new Library.LibraryChange(v,null,null,null,null);}
 int viewings(){return db.queryForObject("select count(*) from viewing",Integer.class);}
 @Test void watchedTrueCreatesFirstSessionAndLeavesWatchlist(){
 change("interest",value(true));
 var row=change("watched",value(true));
 assertEquals(true,row.get("watched"));assertEquals(false,row.get("interest"));
 assertEquals(1,viewings());
 change("watched",value(true));
 assertEquals(1,viewings());
 }
 @Test void watchedFalseRemovesFromRankingAndBumpsVersion(){
 change("watched",value(true));
 db.update("insert into film_ranking(actor,title,tier,position) values(?,?,1,0)",ANA,TITLE);
 int before=db.queryForObject("select ranking_version from profile where actor=?",Integer.class,ANA);
 var row=change("watched",value(false));
 assertEquals(false,row.get("watched"));
 assertEquals(0,db.queryForObject("select count(*) from film_ranking",Integer.class));
 assertEquals(before+1,db.queryForObject("select ranking_version from profile where actor=?",Integer.class,ANA));
 }
 @Test void interestOnWatchedTitleIs409(){
 change("watched",value(true));
 assertFails(HttpStatus.CONFLICT,"A obra já está marcada como assistida.",()->change("interest",value(true)));
 }
 @Test void reviewOver3000CharsIs400(){
 assertFails(HttpStatus.BAD_REQUEST,"Texto acima do limite de 3000 caracteres.",()->change("review",new Library.LibraryChange(null,null,"x".repeat(3001),false,0)));
 }
 @Test void unknownActionIs404(){
 assertFails(HttpStatus.NOT_FOUND,"Ação desconhecida.",()->change("outra",value(true)));
 }
 @Test void suspendedActorIs403(){
 db.update("update profile set active=false where actor=?",ANA);
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->change("watched",value(true)));
 }
 @Test void reviewTextChangeClearsSpoilerVotesButSameTextKeepsThem(){
 db.update("insert into profile(actor,username,name) values(?,?,?)","beto-12345","beto","Beto");
 change("review",new Library.LibraryChange(null,null,"Texto original",false,0));
 db.update("insert into review_spoiler_vote(author,title,voter,contains_spoiler) values(?,?,?,true)",ANA,TITLE,"beto-12345");
 change("review",new Library.LibraryChange(null,null,"Texto original",true,1));
 assertEquals(1,db.queryForObject("select count(*) from review_spoiler_vote",Integer.class));
 change("review",new Library.LibraryChange(null,null,"Texto editado",true,2));
 assertEquals(0,db.queryForObject("select count(*) from review_spoiler_vote",Integer.class));
 }
 @Test void ratingStampsRatedAtOnlyWhenTheValueChanges(){
 change("rating",new Library.LibraryChange(null,8,null,null,null));
 Object first=db.queryForObject("select rated_at from library where actor=? and title=?",Object.class,ANA,TITLE);
 assertNotNull(first);
 db.update("update library set rated_at=timestamp with time zone '2020-01-01 00:00:00+00' where actor=?",ANA);
 change("rating",new Library.LibraryChange(null,8,null,null,null));
 assertEquals(2020,db.queryForObject("select extract(year from rated_at) from library where actor=?",Integer.class,ANA));
 change("rating",new Library.LibraryChange(null,null,null,null,null));
 assertNull(db.queryForObject("select rated_at from library where actor=?",Object.class,ANA));
 }
 @Test void reviewStampsReviewedAtAndRemovingItDropsLikesAndComments(){
 db.update("insert into profile(actor,username,name) values(?,?,?)","beto-12345","beto","Beto");
 change("review",new Library.LibraryChange(null,null,"Gostei",false,0));
 assertNotNull(db.queryForObject("select reviewed_at from library where actor=?",Object.class,ANA));
 db.update("update library set reviewed_at=timestamp with time zone '2020-01-01 00:00:00+00' where actor=?",ANA);
 change("review",new Library.LibraryChange(null,null,"Gostei",true,1));
 assertEquals(2020,db.queryForObject("select extract(year from reviewed_at) from library where actor=?",Integer.class,ANA));
 db.update("insert into review_like(author,title,liker) values(?,?,?)",ANA,TITLE,"beto-12345");
 db.update("insert into review_comment(id,author,title,commenter,body) values('c1',?,?,?,'Boa')",ANA,TITLE,"beto-12345");
 change("review",new Library.LibraryChange(null,null,"Gostei muito",true,2));
 assertEquals(1,db.queryForObject("select count(*) from review_like",Integer.class));
 change("review",new Library.LibraryChange(null,null,"",false,3));
 assertNull(db.queryForObject("select reviewed_at from library where actor=?",Object.class,ANA));
 assertEquals(0,db.queryForObject("select count(*) from review_like",Integer.class));
 assertEquals(0,db.queryForObject("select count(*) from review_comment",Integer.class));
 }
}
