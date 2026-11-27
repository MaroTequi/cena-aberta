package br.com.cenaaberta;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
class DiaryTest {
 static final String ANA="ana-12345",BEA="bea-12345",TITLE="demo-film",KEY="chave-12345";
 JdbcTemplate db;Diary service;
 @BeforeEach void setup(){
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V4__rewatching.sql"),new ClassPathResource("db/migration/V6__viewing_time.sql"),new ClassPathResource("db/migration/V8__public_evaluations.sql")).execute(source);
 db=new JdbcTemplate(source);
 db.update("insert into profile(actor,username,name) values(?,?,?)",ANA,"ana","Ana");
 db.update("insert into profile(actor,username,name) values(?,?,?)",BEA,"bea","Bea");
 db.update("insert into library(actor,title,watched,rewatching) values(?,?,true,true)",ANA,TITLE);
 var actors=new ActiveActors(db);
 service=new Diary(db,actors,new IdempotencyReceipts(db,new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()),new LibraryEntries(db,id->id),org.mockito.Mockito.mock(Episodes.class));
 }
 void assertFails(HttpStatus status,String message,Runnable call){
 var e=assertThrows(ResponseStatusException.class,call::run);
 assertEquals(status,e.getStatusCode());assertEquals(message,e.getReason());
 }
 int viewings(){return db.queryForObject("select count(*) from viewing",Integer.class);}
 static Diary.Viewing viewing(LocalDate date){return new Diary.Viewing(TITLE,date,true,null);}
 String create(String actor,String key,LocalDate date){return service.createViewing(actor,key,viewing(date)).get("id");}
 @Test void sameKeyReturnsSameIdAndOneRow(){
 LocalDate day=LocalDate.of(2024,1,5);
 String first=create(ANA,KEY,day);
 assertEquals(first,create(ANA,KEY,day));
 assertEquals(1,viewings());
 }
 @Test void futureDateIs400(){
 LocalDate tomorrow=LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusDays(1);
 assertFails(HttpStatus.BAD_REQUEST,"A data não pode estar no futuro.",()->create(ANA,KEY,tomorrow));
 assertEquals(0,viewings());
 }
 @Test void otherActorsViewingIs404OnEditAndDelete(){
 String id=create(ANA,KEY,LocalDate.of(2024,1,5));
 assertFails(HttpStatus.NOT_FOUND,"Registro não encontrado.",()->service.editViewing(BEA,id,viewing(LocalDate.of(2024,1,6))));
 assertFails(HttpStatus.NOT_FOUND,"Registro não encontrado.",()->service.deleteViewing(BEA,id));
 assertEquals(1,viewings());
 }
 @Test void ownerEditsAndDeletes(){
 String id=create(ANA,KEY,LocalDate.of(2024,1,5));
 service.editViewing(ANA,id,viewing(LocalDate.of(2024,1,6)));
 assertEquals(java.sql.Date.valueOf("2024-01-06"),db.queryForObject("select watched_on from viewing where id=?",java.sql.Date.class,id));
 service.deleteViewing(ANA,id);
 assertEquals(0,viewings());
 }
 @Test void suspendedActorIs403(){
 db.update("update profile set active=false where actor=?",ANA);
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->create(ANA,KEY,LocalDate.of(2024,1,5)));
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->service.editViewing(ANA,"x",viewing(LocalDate.of(2024,1,5))));
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->service.deleteViewing(ANA,"x"));
 }
 @Test void rewatchWithoutRewatchingFlagIs409(){
 db.update("update library set rewatching=false where actor=?",ANA);
 assertFails(HttpStatus.CONFLICT,"Marque Vi novamente para registrar outra sessão.",()->create(ANA,KEY,LocalDate.of(2024,1,5)));
 }
}
