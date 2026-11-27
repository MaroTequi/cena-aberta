package br.com.cenaaberta;

import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class TitleFriendsTest {
    static final String ANA="ana-12345678",BIA="bia-12345678",CAIO="caio-12345678",DANI="dani-12345678";
    JdbcTemplate db; TitleFriends service;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        for(String actor:List.of(ANA,BIA,CAIO,DANI)) TestDatabase.profile(db,actor);
        TestDatabase.friends(db,ANA,BIA); TestDatabase.friends(db,CAIO,ANA);
        service=new TitleFriends(db,new ActiveActors(db));
    }

    @SuppressWarnings("unchecked") List<Map<String,Object>> items() { return (List<Map<String,Object>>)service.friends(ANA,"demo-a").get("items"); }

    @Test void respectsVisibilityOfEachField() {
        db.update("insert into library(actor,title,watched,rating,review,spoiler,evaluation_public) values(?,'demo-a',true,9,'Lindo',true,true)",BIA);
        db.update("insert into library(actor,title,watched,rating,review,evaluation_public) values(?,'demo-a',true,4,'Ruim',false)",CAIO);
        db.update("insert into library(actor,title,watched,rating,evaluation_public) values(?,'demo-a',true,7,true)",DANI);
        var list=items();
        assertEquals(List.of("bia","caio"),list.stream().map(i -> i.get("username")).toList());
        assertEquals(9,list.get(0).get("rating")); assertEquals("Lindo",list.get(0).get("review")); assertEquals(true,list.get(0).get("spoiler"));
        assertEquals(true,list.get(1).get("watched")); assertNull(list.get(1).get("rating")); assertNull(list.get(1).get("review"));
    }

    @Test void hiddenWatchedListAndWatchlistDropTheFriend() {
        db.update("insert into library(actor,title,watched) values(?,'demo-a',true)",BIA);
        db.update("insert into library(actor,title,interest) values(?,'demo-a',true)",CAIO);
        assertEquals(List.of("bia"),items().stream().map(i -> i.get("username")).toList());
        db.update("update profile set show_watchlist=true where actor=?",CAIO);
        assertEquals(true,items().get(1).get("interest"));
        db.update("update profile set show_watched=false where actor=?",BIA);
        assertEquals(List.of("caio"),items().stream().map(i -> i.get("username")).toList());
    }

    @Test void invalidTitleIs400() {
        fails(400,() -> service.friends(ANA,"../x"));
    }
}
