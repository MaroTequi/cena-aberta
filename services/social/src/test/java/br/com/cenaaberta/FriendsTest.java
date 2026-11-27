package br.com.cenaaberta;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
class FriendsTest {
 JdbcTemplate db;Friends service;
 @BeforeEach void setup(){
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V3__profile_cpf_avatar.sql"),new ClassPathResource("db/migration/V15__friendships.sql")).execute(source);
 db=new JdbcTemplate(source);for(String a:List.of("ana","bia","caio"))db.update("insert into profile(actor,username,name) values(?,?,?)",a,a,a);service=new Friends(db);
 }
 @Test void consentPermissionsAndDuplicateRequests(){
 String id=service.invite("ana",new Friends.Invitation("bia")).get("id");
 assertEquals(id,service.invite("ana",new Friends.Invitation("bia")).get("id"));
 assertEquals(id,service.invite("bia",new Friends.Invitation("ana")).get("id"));
 assertEquals("outgoing",service.status("ana","bia").get("relationship"));
 assertEquals("incoming",service.status("bia","ana").get("relationship"));
 assertThrows(ResponseStatusException.class,()->service.status("ana","ana"));
 assertEquals("outgoing",service.search("ana","bia").getFirst().get("relationship"));
 assertEquals("incoming",service.search("bia","ana").getFirst().get("relationship"));
 assertThrows(ResponseStatusException.class,()->service.decide("caio",id,new Friends.Decision("accept")));
 assertThrows(ResponseStatusException.class,()->service.decide("ana",id,new Friends.Decision("accept")));
 service.decide("bia",id,new Friends.Decision("accept"));
 assertEquals("friends",service.status("ana","bia").get("relationship"));
 assertEquals("friends",service.search("ana","bia").getFirst().get("relationship"));
 assertThrows(ResponseStatusException.class,()->service.decide("caio",id,new Friends.Decision("remove")));
 service.decide("ana",id,new Friends.Decision("remove"));
 assertEquals("none",service.status("ana","bia").get("relationship"));
 assertEquals("none",service.search("bia","ana").getFirst().get("relationship"));
 }
 @Test void profileShowsOnlyAcceptedActiveFriendsWithoutPrivateFields(){
 String id=service.invite("ana",new Friends.Invitation("bia")).get("id");
 assertTrue(((List<?>)service.profile("ana",0).get("items")).isEmpty());
 service.decide("bia",id,new Friends.Decision("accept"));
 service.invite("ana",new Friends.Invitation("caio"));
 var items=(List<Map<String,Object>>)service.profile("ana",0).get("items");
 assertEquals(1,items.size());assertEquals("bia",items.getFirst().get("username"));
 assertEquals(Set.of("username","name","avatar"),items.getFirst().keySet());
 assertEquals("ana",((List<Map<String,Object>>)service.profile("bia",0).get("items")).getFirst().get("username"));
 assertTrue(((List<?>)service.profile("ana",1).get("items")).isEmpty());
 assertEquals(false,service.profile("ana",0).get("hasMore"));
 assertThrows(ResponseStatusException.class,()->service.profile("ana",-1));
 assertThrows(ResponseStatusException.class,()->service.profile("missing",0));
 db.update("update profile set active=false where actor='bia'");
 assertTrue(((List<?>)service.profile("ana",0).get("items")).isEmpty());
 assertThrows(ResponseStatusException.class,()->service.profile("bia",0));
 }
 @Test void declineCancelPrivacyAndInactivePeople(){
 assertThrows(ResponseStatusException.class,()->service.invite("ana",new Friends.Invitation("ana")));
 String id=service.invite("ana",new Friends.Invitation("bia")).get("id");
 assertThrows(ResponseStatusException.class,()->service.decide("ana",id,new Friends.Decision("decline")));
 service.decide("bia",id,new Friends.Decision("decline"));
 String nextId=service.invite("ana",new Friends.Invitation("bia")).get("id");service.decide("ana",nextId,new Friends.Decision("cancel"));
 assertTrue(((List<?>)service.list("ana",0).get("items")).isEmpty());
 var person=service.search("ana","bia").getFirst();assertEquals(Set.of("username","name","avatar","id","relationship"),person.keySet());
 assertTrue(service.search("ana","%_").isEmpty());
 db.update("update profile set active=false where actor='bia'");
 assertTrue(service.search("ana","bia").isEmpty());assertThrows(ResponseStatusException.class,()->service.invite("ana",new Friends.Invitation("bia")));
 }
}
