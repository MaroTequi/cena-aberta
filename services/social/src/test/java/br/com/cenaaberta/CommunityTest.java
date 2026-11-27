package br.com.cenaaberta;

import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

/** Caracterização de GET /titles/{id}/community para filme, série e temporada (antes coberto só pelo smoke). */
class CommunityTest {
    static final String ANA="ana-12345678",BIA="bia-12345678",CAIO="caio-12345678";
    JdbcTemplate db; Community service;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        for(String actor:List.of(ANA,BIA,CAIO)) TestDatabase.profile(db,actor);
        service=new Community(db,new ActiveActors(db),new LibraryEntries(db,id -> "movie"));
    }

    static double number(Object value) { return ((Number)value).doubleValue(); }
    @SuppressWarnings("unchecked") static List<Map<String,Object>> reviews(Map<String,Object> result) { return (List<Map<String,Object>>)result.get("reviews"); }

    @Test void shouldAverageOnlyPublicRatingsOfActiveProfilesForMovies() {
        db.update("insert into library(actor,title,watched,rating,review,evaluation_public) values(?,'demo-a',true,8,'Ótimo',true)",ANA);
        db.update("insert into library(actor,title,watched,rating,evaluation_public) values(?,'demo-a',true,5,true)",BIA);
        db.update("insert into library(actor,title,watched,rating,evaluation_public) values(?,'demo-a',true,10,false)",CAIO);
        var result=service.community(CAIO,"demo-a");
        assertEquals(2L,((Number)result.get("rating_count")).longValue());
        assertEquals(3.25,number(result.get("average")),1e-9);
        assertEquals(List.of("ana"),reviews(result).stream().map(review -> review.get("username")).toList());
        assertEquals(8,reviews(result).getFirst().get("rating"));
        assertFalse(result.containsKey("seasons"));
        db.update("update profile set active=false where actor=?",ANA);
        result=service.community(CAIO,"demo-a");
        assertEquals(1L,((Number)result.get("rating_count")).longValue());
        assertEquals(List.of(),reviews(result));
    }

    @Test void shouldAggregateSeriesBySeasonFromPublicEpisodes() {
        db.update("insert into library(actor,title,watched,review,evaluation_public) values(?,'tmdb-tv-1',true,'Série boa',true)",ANA);
        for(String episode:List.of("ep-tmdb-tv-1-s1-e1","ep-tmdb-tv-1-s1-e2","ep-tmdb-tv-1-s2-e1"))
            db.update("insert into library(actor,title,watched,evaluation_public) values(?,?,true,true)",ANA,episode);
        db.update("insert into episode_rating values(?,'tmdb-tv-1',1,1,8),(?,'tmdb-tv-1',1,2,7),(?,'tmdb-tv-1',2,1,10)",ANA,ANA,ANA);
        db.update("insert into library(actor,title,watched,evaluation_public) values(?,'tmdb-tv-1',true,false),(?,'ep-tmdb-tv-1-s1-e1',true,true)",BIA,BIA);
        db.update("insert into episode_rating values(?,'tmdb-tv-1',1,1,1)",BIA);
        var series=service.community(CAIO,"tmdb-tv-1");
        assertEquals(1,series.get("rating_count"));
        assertEquals(3,series.get("episode_rating_count"));
        assertEquals(4.5,number(series.get("average")),1e-9);
        assertEquals(List.of(Map.of("season",1,"average",3.5),Map.of("season",2,"average",5.0)),series.get("seasons"));
        assertNull(reviews(series).getFirst().get("rating"));
        var season=service.community(CAIO,"season-tmdb-tv-1-s1");
        assertEquals(1L,((Number)season.get("rating_count")).longValue());
        assertEquals(2L,((Number)season.get("episode_rating_count")).longValue());
        assertEquals(3.5,number(season.get("average")),1e-9);
        assertFalse(season.containsKey("total"));
    }

    @Test void shouldReturnEmptyTotalsWithoutPublicRatings() {
        var result=service.community(ANA,"demo-z");
        assertEquals(0L,((Number)result.get("rating_count")).longValue());
        assertNull(result.get("average"));
        assertEquals(List.of(),reviews(result));
        var series=service.community(ANA,"tmdb-tv-9");
        assertNull(series.get("average"));
        assertEquals(List.of(),series.get("seasons"));
    }

    @Test void shouldNotServeInvalidTitlesOrSuspendedViewers() {
        assertEquals("Identificador inválido.",fails(400,() -> service.community(ANA,"nao valido")).getReason());
        db.update("update profile set active=false where actor=?",ANA);
        assertEquals("Acesso suspenso.",fails(403,() -> service.community(ANA,"demo-a")).getReason());
    }
}
