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
class RankingTest {
 static final String ANA="ana-12345";
 JdbcTemplate db;Ranking service;
 @BeforeEach void setup(){
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V5__film_ranking.sql"),new ClassPathResource("db/migration/V7__episode_rating.sql"),new ClassPathResource("db/migration/V8__public_evaluations.sql")).execute(source);
 db=new JdbcTemplate(source);
 db.update("insert into profile(actor,username,name) values(?,?,?)",ANA,"ana","Ana");
 for(String t:List.of("demo-a","demo-b","demo-c"))db.update("insert into library(actor,title,watched) values(?,?,true)",ANA,t);
 db.update("insert into library(actor,title,watched) values(?,?,false)",ANA,"demo-unwatched");
 service=new Ranking(db,new ActiveActors(db),id->id);
 }
 static Ranking.RankedFilm film(String t,int tier){return new Ranking.RankedFilm(t,tier);}
 void assertFails(HttpStatus status,String message,Runnable call){
 var e=assertThrows(ResponseStatusException.class,call::run);
 assertEquals(status,e.getStatusCode());assertEquals(message,e.getReason());
 }
 @Test void savesAndBumpsVersion(){
 var saved=service.saveRanking(ANA,new Ranking.RankingChange(0,List.of(film("demo-a",2),film("demo-b",0),film("demo-c",2))));
 assertEquals(1,saved.get("version"));
 var items=(List<Map<String,Object>>)service.ranking(ANA).get("items");
 assertEquals(List.of("demo-b","demo-a","demo-c"),items.stream().map(i->i.get("title")).toList());
 assertEquals(1,service.ranking(ANA).get("version"));
 }
 @Test void staleVersionIs409(){
 service.saveRanking(ANA,new Ranking.RankingChange(0,List.of(film("demo-a",1))));
 assertFails(HttpStatus.CONFLICT,"Ranking alterado. Recarregue antes de editar.",()->service.saveRanking(ANA,new Ranking.RankingChange(5,List.of(film("demo-a",1)))));
 }
 @Test void retryAfterNetworkLossIsIdempotent(){
 var change=new Ranking.RankingChange(0,List.of(film("demo-a",1),film("demo-b",3)));
 var first=service.saveRanking(ANA,change);
 var retry=service.saveRanking(ANA,change);
 assertEquals(first,retry);assertEquals(1,retry.get("version"));
 }
 @Test void moreThan100Is400(){
 var items=new ArrayList<Ranking.RankedFilm>();for(int i=0;i<101;i++)items.add(film("demo-"+i,0));
 assertFails(HttpStatus.BAD_REQUEST,"Use até 100 obras.",()->service.saveRanking(ANA,new Ranking.RankingChange(0,items)));
 }
 @Test void invalidTierOrDuplicateIs400(){
 assertFails(HttpStatus.BAD_REQUEST,"Ranking inválido.",()->service.saveRanking(ANA,new Ranking.RankingChange(0,List.of(film("demo-a",5)))));
 assertFails(HttpStatus.BAD_REQUEST,"Ranking inválido.",()->service.saveRanking(ANA,new Ranking.RankingChange(0,List.of(film("demo-a",1),film("demo-a",2)))));
 }
 @Test void unwatchedTitleIs400(){
 assertFails(HttpStatus.BAD_REQUEST,"Adicione apenas obras marcadas como assistidas.",()->service.saveRanking(ANA,new Ranking.RankingChange(0,List.of(film("demo-unwatched",1)))));
 }
 @Test void rankTitleMinusOneRemoves(){
 service.rankTitle(ANA,"demo-a",new Ranking.TierChange(2));
 assertEquals(1,service.ranking(ANA).get("version"));
 service.rankTitle(ANA,"demo-a",new Ranking.TierChange(-1));
 assertEquals(2,service.ranking(ANA).get("version"));
 assertTrue(((List<?>)service.ranking(ANA).get("items")).isEmpty());
 service.rankTitle(ANA,"demo-a",new Ranking.TierChange(-1));
 assertEquals(2,service.ranking(ANA).get("version"));
 }
 @Test void suspendedActorIs403(){
 db.update("update profile set active=false where actor=?",ANA);
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->service.ranking(ANA));
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->service.saveRanking(ANA,new Ranking.RankingChange(0,List.of())));
 }
}
