package br.com.cenaaberta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

/** Filtro "só o que a gente assina" das salas: o que é pedido ao catálogo e quando a sala recusa começar. */
class RoomStreamingFilterTest {
    static final String ANA="ana-actor",BIA="bia-actor",CAIO="caio-actor";
    static final String NO_PROVIDERS="Ninguém da sala informou os streamings que assina. Marquem em Configurações ou desliguem o filtro.";
    JdbcTemplate db;MovieRooms rooms;StreamingServices services;HttpServer catalog;
    final List<String> batchQueries=new CopyOnWriteArrayList<>();
    final List<JsonNode> suggestionRequests=new CopyOnWriteArrayList<>();
    volatile String batchBody="[]";

    @BeforeEach void setup() throws Exception {
        db=TestDatabase.migrated();
        for(String actor:List.of(ANA,BIA,CAIO))TestDatabase.profile(db,actor);
        catalog=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        catalog.createContext("/title-batch",exchange -> {
            batchQueries.add(exchange.getRequestURI().getQuery());
            byte[] bytes=batchBody.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });
        catalog.createContext("/suggestions",exchange -> {
            var request=new ObjectMapper().readTree(exchange.getRequestBody());
            suggestionRequests.add(request);
            byte[] bytes=("{\"items\":[{\"id\":\"tmdb-movie-"+request.path("page").asInt()+"\",\"format\":\"movie\",\"name\":\"Sugestão\"}],\"nextPage\":3}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });
        catalog.start();
        rooms=new MovieRooms(db,new ObjectMapper(),"catalog-key-with-24-characters","http://127.0.0.1:"+catalog.getAddress().getPort());
        services=new StreamingServices(db,new ActiveActors(db));
    }

    @AfterEach void close() { catalog.stop(0); }

    String roomOf(String owner,String... guests) {
        String id=rooms.create(owner,new MovieRooms.Create("Sessão")).get("id");
        for(String guest:guests)rooms.join(guest,id);
        return id;
    }

    void subscribe(String actor,Integer... providers) { services.save(actor,new StreamingServices.ProvidersInput(Arrays.asList(providers))); }

    MovieRooms.Settings filter(boolean on) { return new MovieRooms.Settings(null,null,null,on); }

    static List<Integer> providers(JsonNode request) {
        var ids=new ArrayList<Integer>();request.path("providers").forEach(node -> ids.add(node.asInt()));return ids;
    }

    @Test void shouldStartWithFilterOffAndAskCatalogWithoutProviders() {
        String id=roomOf(ANA,BIA);
        subscribe(ANA,8);
        assertEquals(false,rooms.state(ANA,id).get("subscribedOnly"));
        assertEquals(1,rooms.state(BIA,id).get("providerCount"));
        rooms.start(ANA,id);
        assertEquals(1,suggestionRequests.size());
        assertEquals(List.of(),providers(suggestionRequests.getFirst()));
    }

    @Test void shouldSendTheUnionOfMembersServicesWhenFilterIsOn() {
        String id=roomOf(ANA,BIA,CAIO);
        subscribe(ANA,119,8);subscribe(BIA,8,337);
        var saved=rooms.settings(ANA,id,filter(true));
        assertEquals(true,saved.get("subscribedOnly"));
        assertEquals(true,rooms.state(CAIO,id).get("subscribedOnly"));
        assertEquals(3,rooms.state(CAIO,id).get("providerCount"));
        assertFalse(rooms.state(CAIO,id).containsKey("providers"),"a sala não revela quais serviços cada pessoa assina");
        rooms.start(ANA,id);
        assertEquals(List.of(8,119,337),providers(suggestionRequests.getFirst()));
    }

    @Test void shouldFilterTheSharedWatchlistToo() {
        String id=roomOf(ANA,BIA);
        subscribe(BIA,8,119);
        db.update("insert into library(actor,title,interest) values(?,?,true)",ANA,"demo-film");
        batchBody="[{\"id\":\"demo-film\",\"format\":\"movie\",\"name\":\"Filme\"}]";
        rooms.settings(ANA,id,filter(true));
        rooms.start(ANA,id);
        assertEquals(1,batchQueries.size());
        assertTrue(batchQueries.getFirst().endsWith("&providers=8,119"),batchQueries.getFirst());
        assertTrue(suggestionRequests.isEmpty(),"a lista de interesse já encheu a rodada");
    }

    @Test void shouldKeepGenresAndTypeWhenOnlyTheFilterChanges() {
        String id=roomOf(ANA,BIA);
        rooms.settings(ANA,id,new MovieRooms.Settings(null,List.of(35,28),"tv"));
        var saved=rooms.settings(ANA,id,filter(true));
        assertEquals(List.of(28,35),saved.get("genres"));
        assertEquals("tv",saved.get("type"));
        assertEquals(true,rooms.settings(ANA,id,new MovieRooms.Settings(null,List.of(18),null)).get("subscribedOnly"),"mudar gênero não desliga o filtro");
        assertEquals(false,rooms.settings(ANA,id,filter(false)).get("subscribedOnly"));
    }

    @Test void shouldRefuseToStartWhenNobodyInformedServices() {
        String id=roomOf(ANA,BIA);
        rooms.settings(ANA,id,filter(true));
        assertEquals(NO_PROVIDERS,fails(409,() -> rooms.start(ANA,id)).getReason());
        assertEquals("lobby",rooms.state(ANA,id).get("status"));
        subscribe(BIA,8);
        rooms.start(ANA,id);
        assertEquals("voting",rooms.state(ANA,id).get("status"));
    }

    @Test void shouldIgnoreServicesOfSuspendedMembersAndOnlyLetTheHostChange() {
        String id=roomOf(ANA,BIA);
        subscribe(ANA,8);subscribe(BIA,337);
        fails(403,() -> rooms.settings(BIA,id,filter(true)));
        rooms.settings(ANA,id,filter(true));
        db.update("update profile set active=false where actor=?",BIA);
        assertEquals(1,rooms.state(ANA,id).get("providerCount"));
    }

    @Test void shouldSendEveryServiceWhenTheUnionPassesSixty() {
        String id=roomOf(ANA,BIA);
        var first=new ArrayList<Integer>();var second=new ArrayList<Integer>();
        for(int n=1;n<=60;n++){first.add(n);second.add(n+60);}
        services.save(ANA,new StreamingServices.ProvidersInput(first));
        services.save(BIA,new StreamingServices.ProvidersInput(second));
        rooms.settings(ANA,id,filter(true));
        assertEquals(120,rooms.state(ANA,id).get("providerCount"));
        rooms.start(ANA,id);
        assertEquals(120,providers(suggestionRequests.getFirst()).size());
    }

    @Test void shouldKeepFilteringLaterRounds() {
        String id=roomOf(ANA,BIA);
        subscribe(ANA,8);
        rooms.settings(ANA,id,filter(true));
        rooms.start(ANA,id);
        for(String actor:List.of(ANA,BIA))rooms.vote(actor,id,"tmdb-movie-1",new MovieRooms.Vote(false));
        rooms.more(ANA,id);
        assertEquals(2,suggestionRequests.size());
        assertEquals(List.of(8),providers(suggestionRequests.getLast()));
        subscribe(ANA);
        for(String actor:List.of(ANA,BIA))rooms.vote(actor,id,"tmdb-movie-3",new MovieRooms.Vote(false));
        assertEquals(NO_PROVIDERS,fails(409,() -> rooms.more(ANA,id)).getReason());
    }
}
