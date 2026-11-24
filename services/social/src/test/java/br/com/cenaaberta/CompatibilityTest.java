package br.com.cenaaberta;

import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class CompatibilityTest {
    static final String ANA="ana-12345678",BIA="bia-12345678",CAIO="caio-12345678";
    JdbcTemplate db; Compatibility service;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        for(String actor:List.of(ANA,BIA,CAIO)) TestDatabase.profile(db,actor);
        TestDatabase.friends(db,BIA,ANA);
        service=new Compatibility(db,new ActiveActors(db));
    }

    void rate(String actor,String title,int rating,boolean open) {
        db.update("insert into library(actor,title,rating,evaluation_public) values(?,?,?,?)",actor,title,rating,open);
    }

    @Test void agreementUsesOnlyFriendPublicRatings() {
        rate(ANA,"demo-a",10,true); rate(BIA,"demo-a",10,true);
        rate(ANA,"demo-b",8,true);  rate(BIA,"demo-b",7,true);
        rate(ANA,"demo-c",2,true);  rate(BIA,"demo-c",8,true);
        rate(ANA,"demo-d",5,true);  rate(BIA,"demo-d",5,false);
        var result=service.compatibility(ANA,"bia");
        assertEquals(3,result.get("shared"));
        // média |diferença| = (0+1+6)/3 = 2,333 → 100 − 25,9 = 74
        assertEquals(74,result.get("agreement"));
        assertEquals(List.of("demo-a","demo-b"),((List<Map<String,Object>>)result.get("agree")).stream().map(p -> p.get("title")).toList());
        assertEquals(Map.of("title","demo-c","mine",2,"theirs",8),((List<?>)result.get("disagree")).getFirst());
    }

    @Test void fewerThanThreeSharedGivesNullAgreement() {
        rate(ANA,"demo-a",10,true); rate(BIA,"demo-a",1,true);
        var result=service.compatibility(ANA,"bia");
        assertEquals(1,result.get("shared")); assertNull(result.get("agreement"));
        assertEquals(1,((List<?>)result.get("disagree")).size());
    }

    @Test void onlyFriends() {
        fails(403,() -> service.compatibility(ANA,"caio"));
        fails(400,() -> service.compatibility(ANA,"ana"));
        fails(404,() -> service.compatibility(ANA,"ninguem"));
        db.update("update friendship set status='pending'");
        fails(403,() -> service.compatibility(ANA,"bia"));
    }
}
