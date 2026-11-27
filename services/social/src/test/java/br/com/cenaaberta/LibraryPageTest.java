package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

/** Filtros e ordenação de /library-page, inclusive o que um visitante pode ver. */
class LibraryPageTest {
    static final String ANA="ana-12345678",BIA="bia-12345678";
    JdbcTemplate db; Social social;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        TestDatabase.profile(db,ANA); TestDatabase.profile(db,BIA);
        var catalog=TestDatabase.catalog("""
            [{"id":"demo-a","format":"movie","anime":false,"name":"Zebra","year":"1999"},
             {"id":"demo-b","format":"tv","anime":false,"name":"Ábaco","year":"2020"},
             {"id":"demo-c","format":"movie","anime":true,"name":"Bola","year":"2010"}]""");
        social=new Social(db,new ActiveActors(db),new LibraryEntries(db,id -> "movie"),org.mockito.Mockito.mock(Ranking.class),catalog);
        db.update("insert into library(actor,title,watched,rating,evaluation_public) values(?,'demo-a',true,9,true),(?,'demo-b',true,null,true),(?,'demo-c',true,4,false)",ANA,ANA,ANA);
        db.update("insert into viewing(id,actor,title,watched_on,rewatch,created) values('v1',?,'demo-b',date '2025-01-01',false,?),('v2',?,'demo-c',date '2025-02-01',false,?)",
            ANA,OffsetDateTime.now().minusDays(2),ANA,OffsetDateTime.now().minusDays(1));
    }

    List<Object> titles(String viewer,String username,String sort,String filter) {
        return ((List<Map<String,Object>>)social.libraryPage(viewer,"watched",1,username,sort,filter).get("items")).stream().map(i -> i.get("title")).toList();
    }

    @Test void defaultsKeepTheOldOrder() {
        assertEquals(List.of("demo-a","demo-b","demo-c"),titles(ANA,null,"title","all"));
    }

    @Test void ownerSortsAndFilters() {
        assertEquals(List.of("demo-a","demo-c","demo-b"),titles(ANA,null,"rating","all"));
        assertEquals(List.of("demo-c","demo-b","demo-a"),titles(ANA,null,"recent","all"));
        assertEquals(List.of("demo-b","demo-c","demo-a"),titles(ANA,null,"name","all"));
        assertEquals(List.of("demo-b","demo-c","demo-a"),titles(ANA,null,"year","all"));
        assertEquals(List.of("demo-b"),titles(ANA,null,"title","unrated"));
        assertEquals(List.of("demo-a","demo-c"),titles(ANA,null,"title","rated"));
        assertEquals(List.of("demo-a"),titles(ANA,null,"title","min:5"));
        assertEquals(List.of("demo-a"),titles(ANA,null,"title","movie"));
        assertEquals(List.of("demo-b"),titles(ANA,null,"name","tv"));
        assertEquals(List.of("demo-c"),titles(ANA,null,"title","anime"));
        assertEquals(1L,social.libraryPage(ANA,"watched",1,null,"name","all").get("pages"));
    }

    @Test void visitorOnlyFiltersByVisibleRatingsAndRecentNeedsPublicDiary() {
        assertEquals(List.of("demo-a"),titles(BIA,"ana","title","rated"));
        assertEquals(List.of("demo-b","demo-c"),titles(BIA,"ana","title","unrated"));
        assertEquals(List.of("demo-a","demo-b","demo-c"),titles(BIA,"ana","rating","all"));
        assertEquals(List.of("demo-a","demo-b","demo-c"),titles(BIA,"ana","recent","all"));
        db.update("update profile set show_diary=true where actor=?",ANA);
        assertEquals(List.of("demo-c","demo-b","demo-a"),titles(BIA,"ana","recent","all"));
    }

    @Test void invalidSortOrFilterIs400() {
        fails(400,() -> social.libraryPage(ANA,"watched",1,null,"aleatorio","all"));
        fails(400,() -> social.libraryPage(ANA,"watched",1,null,"title","min:11"));
        fails(400,() -> social.libraryPage(ANA,"watched",1,null,"title","min:0"));
        fails(400,() -> social.libraryPage(ANA,"watched",1,null,"title","min:5; drop table library"));
    }

    @Test void listsVisibilityToggleAndAll() {
        assertEquals(false,social.visibility(ANA,new Social.ProfileVisibility("lists",false)).get("lists"));
        assertEquals(true,social.visibility(ANA,new Social.ProfileVisibility("all",true)).get("lists"));
    }
}
