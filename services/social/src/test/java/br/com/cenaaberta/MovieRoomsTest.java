package br.com.cenaaberta;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class MovieRoomsTest {
    JdbcTemplate db;MovieRooms rooms;HttpServer server;
    @BeforeEach void setup() throws Exception {
        var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V3__profile_cpf_avatar.sql"),new ClassPathResource("db/migration/V10__movie_rooms.sql"),new ClassPathResource("db/migration/V11__room_suggestions.sql"),new ClassPathResource("db/migration/V14__room_genre.sql"),new ClassPathResource("db/migration/V17__room_reconsideration.sql"),new ClassPathResource("db/migration/V18__room_multiple_genres.sql"),new ClassPathResource("db/migration/V15__friendships.sql"),new ClassPathResource("db/migration/V19__room_invitations.sql"),new ClassPathResource("db/migration/V23__room_end_notices.sql"),new ClassPathResource("db/migration/V26__room_media_type.sql")).execute(source);
        db=new JdbcTemplate(source);
        for(String actor:List.of("a","b","c"))db.update("insert into profile(actor,username,name) values(?,?,?)",actor,actor,actor);
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/title-batch",exchange->{
            assertEquals("catalog-key",exchange.getRequestHeaders().getFirst("X-Internal-Key"));
            String json="[{\"id\":\"demo-film\",\"format\":\"movie\",\"name\":\"Film\"},{\"id\":\"demo-anime\",\"format\":\"movie\",\"name\":\"Anime\",\"anime\":true},{\"id\":\"demo-series\",\"format\":\"tv\",\"name\":\"Series\"}]";
            byte[] bytes=json.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });
        server.createContext("/suggestions",exchange->{
            var request=new ObjectMapper().readTree(exchange.getRequestBody());
            int page=request.path("page").asInt();
            String json="{\"items\":[{\"id\":\"tmdb-movie-"+page+"\",\"format\":\"movie\",\"name\":\"Suggestion\"}],\"nextPage\":"+(page+2)+"}";
            byte[] bytes=json.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
        rooms=new MovieRooms(db,new ObjectMapper(),"catalog-key","http://127.0.0.1:"+server.getAddress().getPort());
    }
    @AfterEach void close(){server.stop(0);}
    void watch(String actor,String title){db.update("insert into library(actor,title,interest) values(?,?,true)",actor,title);}
    @Test void majorityPromptsOnlyDissentersOnceAndRequiresAllInitialVotes(){
        watch("a","demo-film");String id=rooms.create("a",new MovieRooms.Create("Maioria")).get("id");rooms.join("b",id);rooms.join("c",id);rooms.start("a",id);
        rooms.vote("a",id,"demo-film",new MovieRooms.Vote(true));rooms.vote("c",id,"demo-film",new MovieRooms.Vote(false));
        assertEquals(List.of(),rooms.state("c",id).get("reconsiderations"));
        assertThrows(ResponseStatusException.class,()->rooms.reconsider("c",id,"demo-film",new MovieRooms.Vote(true)));
        rooms.vote("b",id,"demo-film",new MovieRooms.Vote(true));
        var proposals=(List<?>)rooms.state("c",id).get("reconsiderations");assertEquals(1,proposals.size());
        var supporters=(List<?>)((Map<?,?>)proposals.getFirst()).get("supporters");assertEquals(2,supporters.size());
        assertEquals(List.of(),rooms.state("a",id).get("reconsiderations"));
        assertThrows(ResponseStatusException.class,()->rooms.reconsider("a",id,"demo-film",new MovieRooms.Vote(true)));
        assertThrows(ResponseStatusException.class,()->rooms.choose("a",id,"demo-film"));
        rooms.reconsider("c",id,"demo-film",new MovieRooms.Vote(false));rooms.reconsider("c",id,"demo-film",new MovieRooms.Vote(false));
        assertEquals(List.of(),rooms.state("c",id).get("reconsiderations"));assertEquals(List.of(),rooms.state("a",id).get("matches"));
        assertThrows(ResponseStatusException.class,()->rooms.vote("c",id,"demo-film",new MovieRooms.Vote(true)));
    }
    @Test void tieDoesNotPromptAndReconsiderationCanCreateUnanimity(){
        watch("a","demo-film");String id=rooms.create("a",new MovieRooms.Create("Empate")).get("id");rooms.join("b",id);rooms.start("a",id);
        rooms.vote("a",id,"demo-film",new MovieRooms.Vote(true));rooms.vote("b",id,"demo-film",new MovieRooms.Vote(false));assertEquals(List.of(),rooms.state("b",id).get("reconsiderations"));
        String second=rooms.create("a",new MovieRooms.Create("Reconsiderar")).get("id");rooms.join("b",second);rooms.join("c",second);rooms.start("a",second);
        rooms.vote("a",second,"demo-film",new MovieRooms.Vote(true));rooms.vote("b",second,"demo-film",new MovieRooms.Vote(true));rooms.vote("c",second,"demo-film",new MovieRooms.Vote(false));
        rooms.reconsider("c",second,"demo-film",new MovieRooms.Vote(true));rooms.reconsider("c",second,"demo-film",new MovieRooms.Vote(true));
        assertEquals(List.of("demo-film"),rooms.state("a",second).get("matches"));rooms.choose("a",second,"demo-film");
        assertEquals(List.of(),rooms.state("c",second).get("reconsiderations"));
    }
    @Test void lastGuestCanLeaveBeforeVotingOrAfterChoiceWithoutClosingRoom(){
        watch("a","demo-film");
        String id=rooms.create("a",new MovieRooms.Create("Dupla")).get("id");
        rooms.join("b",id);
        assertFalse(rooms.leave("b",id).get("dissolved"));
        assertEquals("lobby",rooms.state("a",id).get("status"));
        rooms.join("b",id);rooms.start("a",id);
        for(String actor:List.of("a","b"))rooms.vote(actor,id,"demo-film",new MovieRooms.Vote(true));
        rooms.choose("a",id,"demo-film");
        assertFalse(rooms.leave("b",id).get("dissolved"));
        var room=rooms.state("a",id);
        assertEquals("chosen",room.get("status"));assertEquals("demo-film",room.get("chosen"));
        assertEquals(1,((List<?>)room.get("members")).size());
        assertEquals(0,db.queryForObject("select count(*) from room_end_notice where room=? and visible_at<=CURRENT_TIMESTAMP",Integer.class,id));
    }
    @Test void guestLeaveRecountsVotesAndLastPairGetsNotified(){
        watch("a","demo-film");
        String id=rooms.create("a",new MovieRooms.Create("Rodada")).get("id");
        assertThrows(ResponseStatusException.class,()->rooms.leave("c",id));
        rooms.join("b",id);rooms.join("c",id);rooms.start("a",id);
        assertThrows(ResponseStatusException.class,()->rooms.leave("a",id));
        rooms.vote("a",id,"demo-film",new MovieRooms.Vote(true));
        rooms.vote("b",id,"demo-film",new MovieRooms.Vote(true));
        rooms.vote("c",id,"demo-film",new MovieRooms.Vote(false));
        assertEquals(false,rooms.leave("c",id).get("dissolved"));
        assertEquals(List.of("demo-film"),rooms.state("a",id).get("matches"));
        assertEquals(true,rooms.leave("b",id).get("dissolved"));
        assertEquals(List.of("a","b"),db.queryForList("select recipient from room_end_notice where room=? and reason='closedByLeave' and visible_at<=CURRENT_TIMESTAMP order by recipient",String.class,id));
        assertEquals(410,assertThrows(ResponseStatusException.class,()->rooms.state("a",id)).getStatusCode().value());
        assertEquals(404,assertThrows(ResponseStatusException.class,()->rooms.state("c",id)).getStatusCode().value());
    }
    @Test void onlyOwnerCanDeleteRoomAndDependentData(){
        watch("a","demo-film");String id=rooms.create("a",new MovieRooms.Create("Excluir teste")).get("id");rooms.join("b",id);rooms.start("a",id);
        rooms.vote("b",id,"demo-film",new MovieRooms.Vote(true));
        assertEquals(true,rooms.mine("a").getFirst().get("isOwner"));assertEquals(false,rooms.mine("b").getFirst().get("isOwner"));
        assertThrows(ResponseStatusException.class,()->rooms.delete("b",id));assertThrows(ResponseStatusException.class,()->rooms.delete("c",id));
        rooms.delete("a",id);
        for(String table:List.of("movie_room_member","movie_room_title","movie_room_vote"))assertEquals(0,db.queryForObject("select count(*) from "+table+" where room=?",Integer.class,id));
        assertThrows(ResponseStatusException.class,()->rooms.state("a",id));assertTrue(rooms.mine("b").isEmpty());
        assertEquals(1,db.queryForObject("select count(*) from library where actor='a'",Integer.class));
    }
    @Test void roomTypeFiltersTheWatchlistsBeforeVoting(){
        for(String title:List.of("demo-film","demo-series","demo-anime"))watch("b",title);
        var expected=Map.of("all",Set.of("demo-film","demo-series","demo-anime"),"tv",Set.of("demo-series"),"anime",Set.of("demo-anime"));
        for(var entry:expected.entrySet()){
            String id=rooms.create("a",new MovieRooms.Create("Sala")).get("id");
            rooms.join("b",id);
            rooms.settings("a",id,new MovieRooms.Settings(null,null,entry.getKey()));
            rooms.start("a",id);
            assertEquals(entry.getValue(),new HashSet<>(db.queryForList("select title from movie_room_title where room=?",String.class,id)));
        }
    }
    @Test void mergedWatchlistsDeduplicateFilterSeriesAndRequireUnanimity(){
        watch("a","demo-film");watch("b","demo-film");watch("b","demo-anime");watch("b","demo-series");
        String id=rooms.create("a",new MovieRooms.Create("Cinema")).get("id");
        assertThrows(ResponseStatusException.class,()->rooms.start("a",id));
        assertThrows(ResponseStatusException.class,()->rooms.state("b",id));
        rooms.join("b",id);rooms.join("b",id);
        assertThrows(ResponseStatusException.class,()->rooms.start("b",id));
        assertThrows(ResponseStatusException.class,()->rooms.settings("b",id,new MovieRooms.Settings(28)));
        rooms.settings("a",id,new MovieRooms.Settings(28,null,"movie"));
        assertEquals(28,rooms.state("a",id).get("genre"));
        rooms.start("a",id);
        assertThrows(ResponseStatusException.class,()->rooms.settings("a",id,new MovieRooms.Settings(35)));
        assertEquals(2,db.queryForObject("select count(*) from movie_room_title where room=?",Integer.class,id));
        assertThrows(ResponseStatusException.class,()->rooms.join("c",id));
        assertThrows(ResponseStatusException.class,()->rooms.vote("c",id,"demo-film",new MovieRooms.Vote(true)));
        assertThrows(ResponseStatusException.class,()->rooms.vote("a",id,"demo-series",new MovieRooms.Vote(true)));
        rooms.vote("a",id,"demo-film",new MovieRooms.Vote(true));
        assertEquals(List.of(),rooms.state("b",id).get("votes"));
        assertEquals(List.of(),rooms.state("a",id).get("matches"));
        rooms.vote("b",id,"demo-film",new MovieRooms.Vote(false));
        assertThrows(ResponseStatusException.class,()->rooms.choose("a",id,"demo-film"));
        rooms.vote("b",id,"demo-film",new MovieRooms.Vote(true));
        rooms.vote("b",id,"demo-film",new MovieRooms.Vote(true));
        assertEquals(List.of("demo-film"),rooms.state("a",id).get("matches"));
        assertThrows(ResponseStatusException.class,()->rooms.choose("b",id,"demo-film"));
        rooms.choose("a",id,"demo-film");
        assertEquals("demo-film",rooms.state("b",id).get("chosen"));
        assertThrows(ResponseStatusException.class,()->rooms.vote("a",id,"demo-film",new MovieRooms.Vote(false)));
        assertEquals(2,db.queryForObject("select count(*) from library where title='demo-film' and interest=true",Integer.class));
    }
    @Test void emptyDeckKeepsLobbyAndExpiredRoomsAreInaccessible(){
        String id=rooms.create("a",new MovieRooms.Create("Cinema")).get("id");rooms.join("b",id);
        rooms.start("a",id);
        assertEquals("voting",rooms.state("a",id).get("status"));
        assertThrows(ResponseStatusException.class,()->rooms.more("a",id));
        rooms.vote("a",id,"tmdb-movie-1",new MovieRooms.Vote(true));
        rooms.vote("b",id,"tmdb-movie-1",new MovieRooms.Vote(true));
        assertThrows(ResponseStatusException.class,()->rooms.more("b",id));
        rooms.more("a",id);
        assertEquals(2,db.queryForObject("select count(*) from movie_room_title where room=?",Integer.class,id));
        assertEquals(List.of("tmdb-movie-1"),rooms.state("a",id).get("matches"));
        assertEquals(2,db.queryForObject("select count(*) from movie_room_vote where room=?",Integer.class,id));
        assertThrows(ResponseStatusException.class,()->rooms.more("a",id));
        db.update("update movie_room set expires=? where id=?",java.time.OffsetDateTime.now().minusDays(1),id);
        assertThrows(ResponseStatusException.class,()->rooms.state("a",id));
        assertTrue(rooms.mine("a").isEmpty());
    }
    @Test void requiresActiveProfile(){
        var request=new MockHttpServletRequest();request.addHeader("X-Actor","a");
        rooms.verify(request);
        db.update("update profile set active=false where actor='a'");
        assertThrows(ResponseStatusException.class,()->rooms.verify(request));
    }
    @Test void multipleGenresAreValidatedPersistedAndOwnerOnly() {
        String id=rooms.create("a",new MovieRooms.Create("Gêneros")).get("id");rooms.join("b",id);
        assertThrows(ResponseStatusException.class,()->rooms.settings("b",id,new MovieRooms.Settings(null,List.of(28,35))));
        rooms.settings("a",id,new MovieRooms.Settings(null,List.of(35,28,35)));
        assertEquals(List.of(28,35),rooms.state("a",id).get("genres"));
        assertThrows(ResponseStatusException.class,()->rooms.settings("a",id,new MovieRooms.Settings(null,List.of(0,28))));
        assertThrows(ResponseStatusException.class,()->rooms.settings("a",id,new MovieRooms.Settings(null,Arrays.asList(28,null))));
        assertEquals(List.of(28,35),rooms.state("a",id).get("genres"));
        rooms.settings("a",id,new MovieRooms.Settings(null,List.of()));
        assertEquals(List.of(),rooms.state("a",id).get("genres"));
        rooms.settings("a",id,new MovieRooms.Settings(18));
        assertEquals(List.of(18),rooms.state("a",id).get("genres"));
        rooms.start("a",id);
        assertThrows(ResponseStatusException.class,()->rooms.settings("a",id,new MovieRooms.Settings(null,List.of(28,35))));
    }
    @Test void friendInvitationsRequireConsentAndMembershipAndAreIdempotent(){
        String id=rooms.create("a",new MovieRooms.Create("Convites")).get("id");
        assertThrows(ResponseStatusException.class,()->rooms.invite("a",id,new MovieRooms.Invitation("b")));
        db.update("insert into friendship(id,requester,recipient,status) values('friend','a','b','accepted')");
        assertEquals(1,((List<?>)rooms.friends("a",id,0).get("items")).size());
        assertThrows(ResponseStatusException.class,()->rooms.friends("c",id,0));
        assertThrows(ResponseStatusException.class,()->rooms.invite("c",id,new MovieRooms.Invitation("b")));
        rooms.invite("a",id,new MovieRooms.Invitation("b"));rooms.invite("a",id,new MovieRooms.Invitation("b"));
        assertEquals(1,db.queryForObject("select count(*) from movie_room_invitation",Integer.class));
        assertEquals(1,db.queryForObject("select count(*) from movie_room_member where room=?",Integer.class,id));
        assertEquals(true,rooms.mine("b").getFirst().get("invited"));
        assertThrows(ResponseStatusException.class,()->rooms.state("b",id));
        rooms.join("b",id);assertEquals(false,rooms.mine("b").getFirst().get("invited"));
        rooms.start("a",id);assertThrows(ResponseStatusException.class,()->rooms.invite("a",id,new MovieRooms.Invitation("b")));
        rooms.delete("a",id);assertTrue(rooms.mine("b").isEmpty());assertEquals(0,db.queryForObject("select count(*) from movie_room_invitation",Integer.class));
    }
}
