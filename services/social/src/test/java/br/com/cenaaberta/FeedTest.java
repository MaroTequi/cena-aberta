package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class FeedTest {
    static final String ANA="ana-12345678",BIA="bia-12345678",CAIO="caio-12345678";
    JdbcTemplate db; Feed service;
    final OffsetDateTime now=OffsetDateTime.now(ZoneOffset.UTC);

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        for(String actor:List.of(ANA,BIA,CAIO)) TestDatabase.profile(db,actor);
        TestDatabase.friends(db,ANA,BIA);
        db.update("update profile set show_diary=true");
        service=new Feed(db,new ActiveActors(db));
    }

    void viewing(String actor,String title,OffsetDateTime at) {
        db.update("insert into viewing(id,actor,title,watched_on,rewatch,watched_at,created) values(?,?,?,?,false,?,?)",
            UUID.randomUUID().toString(),actor,title,at.toLocalDate(),at,at);
    }

    void evaluation(String actor,String title,Integer rating,String review,boolean open,OffsetDateTime at) {
        db.update("insert into library(actor,title,watched,rating,review,evaluation_public,rated_at,reviewed_at) values(?,?,true,?,?,?,?,?)",
            actor,title,rating,review,open,rating==null?null:at,review==null?null:at);
    }

    @SuppressWarnings("unchecked") List<Map<String,Object>> items(Map<String,Object> page) { return (List<Map<String,Object>>)page.get("items"); }

    @Test void showsOnlyAcceptedFriendsPublicActivityNewestFirst() {
        viewing(BIA,"demo-a",now.minusHours(3));
        evaluation(BIA,"demo-b",8,"Ótimo",true,now.minusHours(1));
        evaluation(BIA,"demo-c",6,null,false,now.minusMinutes(30));
        viewing(CAIO,"demo-d",now.minusMinutes(5));
        viewing(ANA,"demo-e",now.minusMinutes(5));
        var page=service.feed(ANA,null);
        assertEquals(List.of("rated","reviewed","watched"),items(page).stream().map(i -> i.get("kind")).sorted().toList());
        assertEquals("demo-a",items(page).getLast().get("title"));
        assertEquals(Map.of("username","bia","name","bia","avatar",""),items(page).getFirst().get("actor"));
        var reviewed=items(page).stream().filter(i -> i.get("kind").equals("reviewed")).findFirst().orElseThrow();
        assertEquals("Ótimo",reviewed.get("review")); assertEquals(8,reviewed.get("rating")); assertEquals(false,reviewed.get("spoiler"));
        assertTrue(((String)reviewed.get("at")).endsWith("Z"));
        assertNull(page.get("next"));
    }

    @Test void hiddenDiaryHidesWatchedEventsAndSuspendedFriendDisappears() {
        viewing(BIA,"demo-a",now.minusHours(3));
        db.update("update profile set show_diary=false where actor=?",BIA);
        assertTrue(items(service.feed(ANA,null)).isEmpty());
        db.update("update profile set show_diary=true,active=false where actor=?",BIA);
        assertTrue(items(service.feed(ANA,null)).isEmpty());
    }

    @Test void importedOldSessionsDoNotFloodTheFeed() {
        db.update("insert into viewing(id,actor,title,watched_on,rewatch,created) values('old',?,'demo-a',date '2015-05-05',false,?)",BIA,now.minusMinutes(1));
        assertTrue(items(service.feed(ANA,null)).isEmpty());
    }

    @Test void paginatesWithCursorAndRejectsInvalidCursor() {
        for(int i=0;i<25;i++) viewing(BIA,"demo-"+i,now.minusMinutes(i+1));
        var first=service.feed(ANA,null);
        assertEquals(20,items(first).size());
        assertNotNull(first.get("next"));
        var second=service.feed(ANA,(String)first.get("next"));
        assertEquals(5,items(second).size());
        assertNull(second.get("next"));
        assertEquals("demo-24",items(second).getLast().get("title"));
        fails(400,() -> service.feed(ANA,"ontem"));
        fails(401,() -> service.feed("curto",null));
    }
}
