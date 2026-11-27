package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class StatsTest {
    static final String ANA="ana-12345678";
    JdbcTemplate db; Stats service;

    @BeforeEach void setup() {
        db=TestDatabase.migrated(); TestDatabase.profile(db,ANA);
        service=new Stats(db,new ActiveActors(db),TestDatabase.catalog("""
            [{"id":"demo-filme","format":"movie","anime":false,"details":{"genres":["Drama","Crime"],"runtime":100}},
             {"id":"demo-serie","format":"tv","anime":false,"details":{"genres":["Drama"],"runtime":null}},
             {"id":"demo-anime","format":"movie","anime":true,"details":{"genres":["Animação"],"runtime":90}}]"""));
    }

    void viewing(String title,LocalDate date,boolean rewatch) { db.update("insert into viewing(id,actor,title,watched_on,rewatch) values(?,?,?,?,?)",UUID.randomUUID().toString(),ANA,title,date,rewatch); }

    @Test void yearSummaryUsesDiaryCatalogAndRatings() {
        viewing("demo-filme",LocalDate.of(2025,1,10),false); viewing("demo-filme",LocalDate.of(2025,3,5),true);
        viewing("demo-serie",LocalDate.of(2025,3,6),false); viewing("demo-anime",LocalDate.of(2025,12,31),false);
        viewing("demo-sumiu",LocalDate.of(2025,12,1),false); viewing("demo-filme",LocalDate.of(2023,5,5),false);
        db.update("insert into library(actor,title,rating) values(?,'demo-filme',8),(?,'demo-anime',10),(?,'demo-fora',2)",ANA,ANA,ANA);
        var stats=service.stats(ANA,2025);
        assertEquals(5,stats.get("viewings")); assertEquals(4,stats.get("distinctTitles")); assertEquals(1,stats.get("rewatches"));
        assertEquals(290L,stats.get("minutes"));
        assertArrayEquals(new int[]{1,0,2,0,0,0,0,0,0,0,0,2},(int[])stats.get("byMonth"));
        assertEquals(Map.of("movie",1,"tv",1,"anime",1),stats.get("byFormat"));
        assertEquals(List.of(Map.of("name","Drama","count",2),Map.of("name","Animação","count",1),Map.of("name","Crime","count",1)),stats.get("topGenres"));
        assertEquals(9.0,stats.get("averageRating"));
        int[] histogram=(int[])stats.get("ratingHistogram"); assertEquals(1,histogram[7]); assertEquals(1,histogram[9]); assertEquals(0,histogram[1]);
        assertEquals(List.of(Map.of("title","demo-anime","rating",10),Map.of("title","demo-filme","rating",8)),stats.get("topRated"));
        assertEquals(List.of(2025,2023),stats.get("years"));
    }

    @Test void emptyYearHasZerosAndNullAverage() {
        var stats=service.stats(ANA,2020);
        assertEquals(0,stats.get("viewings")); assertNull(stats.get("averageRating")); assertEquals(List.of(),stats.get("topGenres"));
        assertEquals(List.of(),stats.get("years"));
    }

    @Test void invalidYearAndSuspendedActor() {
        fails(400,() -> service.stats(ANA,1899));
        db.update("update profile set active=false");
        fails(403,() -> service.stats(ANA,2025));
    }
}
