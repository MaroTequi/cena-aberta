package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class RecommendationsTest {
    static final String ANA="ana-12345678",BIA="bia-12345678",CAIO="caio-12345678";
    JdbcTemplate db; Recommendations service; Notifications social;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        for(String actor:List.of(ANA,BIA,CAIO)) TestDatabase.profile(db,actor);
        TestDatabase.friends(db,ANA,BIA);
        var catalog=TestDatabase.catalog("[{\"id\":\"demo-a\",\"format\":\"movie\",\"name\":\"Filme A\"},{\"id\":\"demo-b\",\"format\":\"movie\",\"name\":\"Filme B\"}]");
        var actors=new ActiveActors(db);
        service=new Recommendations(db,actors,catalog);
        social=new Notifications(db,actors);
    }

    @SuppressWarnings("unchecked") List<Map<String,Object>> items(Map<String,Object> result) { return (List<Map<String,Object>>)result.get("items"); }

    @Test void recommendNotifyAndMarkRead() {
        var sent=service.recommend(ANA,new Recommendations.RecommendationInput("bia","demo-a","  Veja!  "));
        assertEquals("Filme A",sent.get("titleName")); assertEquals("Veja!",sent.get("message")); assertEquals(false,sent.get("duplicate"));
        var again=service.recommend(ANA,new Recommendations.RecommendationInput("bia","demo-a","outra"));
        assertEquals(sent.get("id"),again.get("id")); assertEquals(true,again.get("duplicate")); assertEquals("Veja!",again.get("message"));
        var inbox=service.received(BIA,0);
        assertEquals(1,inbox.get("unseen"));
        assertEquals("ana",((Map<?,?>)items(inbox).getFirst().get("sender")).get("username"));
        var notice=items(social.notifications(BIA)).getFirst();
        assertEquals("recommendation",notice.get("kind")); assertEquals("demo-a",notice.get("target"));
        assertEquals("Filme A",notice.get("label")); assertEquals("ana",notice.get("sender")); assertEquals(sent.get("id"),notice.get("id"));
        fails(404,() -> service.read(ANA,(String)sent.get("id")));
        assertEquals(true,service.read(BIA,(String)sent.get("id")).get("read"));
        assertEquals(0,service.received(BIA,0).get("unseen"));
        assertTrue(items(social.notifications(BIA)).isEmpty());
    }

    @Test void onlyFriendsAndExistingTitles() {
        fails(403,() -> service.recommend(ANA,new Recommendations.RecommendationInput("caio","demo-a",null)));
        fails(400,() -> service.recommend(ANA,new Recommendations.RecommendationInput("ana","demo-a",null)));
        fails(404,() -> service.recommend(ANA,new Recommendations.RecommendationInput("bia","demo-zzz",null)));
        fails(400,() -> service.recommend(ANA,new Recommendations.RecommendationInput("bia","nao valido",null)));
        fails(400,() -> service.recommend(ANA,new Recommendations.RecommendationInput("bia","demo-a","x".repeat(301))));
        fails(400,() -> service.received(BIA,-1));
    }

    @Test void dailyLimitAndInactiveSenderHidden() {
        for(int i=0;i<30;i++) db.update("insert into recommendation(id,sender,recipient,title,title_name) values(?,?,?,?,'x')",UUID.randomUUID().toString(),ANA,BIA,"demo-x"+i);
        fails(429,() -> service.recommend(ANA,new Recommendations.RecommendationInput("bia","demo-b",null)));
        db.update("update recommendation set created=?",OffsetDateTime.now(ZoneOffset.UTC).minusDays(2));
        assertEquals(false,service.recommend(ANA,new Recommendations.RecommendationInput("bia","demo-b",null)).get("duplicate"));
        assertEquals(31,service.received(BIA,0).get("unseen"));
        db.update("update profile set active=false where actor=?",ANA);
        assertTrue(items(service.received(BIA,0)).isEmpty());
        assertTrue(items(social.notifications(BIA)).isEmpty());
    }
}
