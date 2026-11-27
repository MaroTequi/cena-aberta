package br.com.cenaaberta;
import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
class EpisodesTest {
 static final String ANA="ana-12345";
 static final String SHOW="demo-show";
 static final String INVALID="Episódio ou nota inválidos.";
 JdbcTemplate db;Episodes service;
 @BeforeEach void setup() throws Exception {
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V4__rewatching.sql"),new ClassPathResource("db/migration/V7__episode_rating.sql"),new ClassPathResource("db/migration/V8__public_evaluations.sql")).execute(source);
 db=new JdbcTemplate(source);
 db.update("insert into profile(actor,username,name) values(?,?,?)",ANA,"ana","Ana");
 JsonNode episodes=new ObjectMapper().readTree("[{\"number\":1},{\"number\":2},{\"number\":3}]");
 var catalog=org.mockito.Mockito.mock(CatalogSeasons.class);
 org.mockito.Mockito.when(catalog.season(org.mockito.Mockito.eq(SHOW),org.mockito.Mockito.anyInt())).thenReturn(episodes);
 service=new Episodes(db,new ActiveActors(db),catalog,new LibraryEntries(db,id->id));
 }
 void assertFails(HttpStatus status,String message,Runnable call){
 var e=assertThrows(ResponseStatusException.class,call::run);
 assertEquals(status,e.getStatusCode());assertEquals(message,e.getReason());
 }
 void rate(int season,int episode,Integer rating){service.rateEpisode(ANA,SHOW,season,episode,new Episodes.EpisodeRating(rating));}
 static double number(Object value){return ((Number)value).doubleValue();}
 @Test void acceptsRatingsOneAndTen(){
 rate(1,1,1);rate(1,2,10);
 assertEquals(2,service.episodeRatings(ANA,SHOW,1).size());
 }
 @Test void nullRatingRemoves(){
 rate(1,1,8);
 rate(1,1,null);
 assertTrue(service.episodeRatings(ANA,SHOW,1).isEmpty());
 }
 @Test void invalidInputIs400(){
 assertFails(HttpStatus.BAD_REQUEST,INVALID,()->rate(1,1,0));
 assertFails(HttpStatus.BAD_REQUEST,INVALID,()->rate(1,1,11));
 assertFails(HttpStatus.BAD_REQUEST,INVALID,()->rate(1,0,5));
 assertFails(HttpStatus.BAD_REQUEST,INVALID,()->rate(1001,1,5));
 }
 @Test void unknownEpisodeIs404(){
 assertFails(HttpStatus.NOT_FOUND,"Episódio não encontrado.",()->rate(1,9,5));
 }
 @Test void seasonAverageUsesOnlyRatedEpisodes(){
 rate(1,1,10);rate(1,2,6);rate(1,3,null);
 var averages=service.mySeasonAverages(ANA,SHOW);
 assertEquals(1,averages.size());
 assertEquals(4.0,number(averages.getFirst().get("average")),0.0001);
 }
 @Test void titleAveragesOnlyIncludeSeasonsWithRatings(){
 rate(1,1,10);rate(2,1,4);rate(2,1,null);
 var averages=service.mySeasonAverages(ANA,SHOW);
 assertEquals(1,averages.size());
 assertEquals(1,((Number)averages.getFirst().get("season")).intValue());
 assertEquals(5.0,number(averages.getFirst().get("average")),0.0001);
 }
 @Test void suspendedActorIs403(){
 db.update("update profile set active=false where actor=?",ANA);
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->service.mySeasonAverages(ANA,SHOW));
 assertFails(HttpStatus.FORBIDDEN,"Acesso suspenso.",()->rate(1,1,5));
 }
}
