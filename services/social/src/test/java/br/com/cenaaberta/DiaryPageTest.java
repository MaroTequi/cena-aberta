package br.com.cenaaberta;

import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

/** Caracterização de GET /diary: paginação, filtro por obra e diário de outra pessoa. */
class DiaryPageTest {
    static final String ANA="ana-12345678",BIA="bia-12345678";
    JdbcTemplate db; Diary service;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        TestDatabase.profile(db,ANA); TestDatabase.profile(db,BIA);
        var actors=new ActiveActors(db);
        service=new Diary(db,actors,new IdempotencyReceipts(db,new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()),new LibraryEntries(db,id -> "movie"),
            org.mockito.Mockito.mock(Episodes.class),new Viewings(db),new ProfileVisibilities(db));
        for(int day=1;day<=25;day++)
            db.update("insert into viewing(id,actor,title,watched_on,rewatch) values(?,?,?,?,false)","v"+day,ANA,day==25?"demo-b":"demo-a",java.time.LocalDate.of(2025,1,day));
    }

    static List<Object> ids(Object page) { return ((Viewings.DiaryPage)page).items().stream().map(item -> item.get("id")).toList(); }

    @Test void shouldPageOwnDiaryNewestFirst() {
        var first=service.diary(ANA,1,null,null);
        assertEquals(24,first.items().size());
        assertEquals("v25",ids(first).getFirst());
        assertTrue(first.hasMore());
        var second=service.diary(ANA,2,null,null);
        assertEquals(List.of("v1"),ids(second));
        assertFalse(second.hasMore());
        assertEquals(List.of("v25"),ids(service.diary(ANA,1,null,"demo-b")));
    }

    @Test void shouldShowAnotherDiaryOnlyWhenPublic() {
        fails(403,() -> service.diary(BIA,1,"ana",null));
        db.update("update profile set show_diary=true where actor=?",ANA);
        assertEquals(24,service.diary(BIA,1,"ana",null).items().size());
        fails(404,() -> service.diary(BIA,1,"ninguem",null));
    }

    @Test void shouldRejectInvalidPageOrTitle() {
        fails(400,() -> service.diary(ANA,0,null,null));
        assertEquals("Identificador inválido.",fails(400,() -> service.diary(ANA,1,null,"nao valido")).getReason());
    }
}
