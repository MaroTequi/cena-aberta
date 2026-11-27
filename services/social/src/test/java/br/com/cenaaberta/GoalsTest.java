package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class GoalsTest {
    static final String ANA="ana-12345678";
    JdbcTemplate db; Goals service;

    @BeforeEach void setup() { db=TestDatabase.migrated(); TestDatabase.profile(db,ANA); service=new Goals(db,new ActiveActors(db)); }

    void viewing(String title,LocalDate date) { db.update("insert into viewing(id,actor,title,watched_on,rewatch) values(?,?,?,?,false)",UUID.randomUUID().toString(),ANA,title,date); }

    @Test void doneCountsDistinctTitlesOfTheYearOnly() {
        viewing("demo-a",LocalDate.of(2025,1,1)); viewing("demo-a",LocalDate.of(2025,6,1));
        viewing("demo-b",LocalDate.of(2025,12,31)); viewing("demo-c",LocalDate.of(2024,12,31));
        var goal=service.goal(ANA,2025);
        assertEquals(2025,goal.get("year")); assertNull(goal.get("target")); assertEquals(2,goal.get("done"));
        assertEquals(LocalDate.now(Guards.DIARY_ZONE).getYear(),service.goal(ANA,null).get("year"));
    }

    @Test void setReplaceAndRemoveTarget() {
        assertEquals(50,service.save(ANA,new Goals.GoalInput(2025,50)).get("target"));
        assertEquals(1000,service.save(ANA,new Goals.GoalInput(2025,1000)).get("target"));
        assertNull(service.save(ANA,new Goals.GoalInput(2025,null)).get("target"));
        assertEquals(0,db.queryForObject("select count(*) from annual_goal",Integer.class));
    }

    @Test void limitsAreEnforced() {
        fails(400,() -> service.save(ANA,new Goals.GoalInput(2025,0)));
        fails(400,() -> service.save(ANA,new Goals.GoalInput(2025,1001)));
        fails(400,() -> service.save(ANA,new Goals.GoalInput(null,10)));
        fails(400,() -> service.save(ANA,new Goals.GoalInput(1899,10)));
        fails(400,() -> service.goal(ANA,2201));
        db.update("update profile set active=false");
        fails(403,() -> service.goal(ANA,2025));
    }
}
