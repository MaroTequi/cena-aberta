package br.com.cenaaberta;

import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

/** Caracterização de GET /me, PUT /me/profile, GET /profiles e PUT /me/visibility (antes cobertos só pelo smoke). */
class ProfilesTest {
    static final String ANA="ana-12345678",BIA="bia-12345678";
    JdbcTemplate db; Profiles service;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        TestDatabase.profile(db,ANA); TestDatabase.profile(db,BIA);
        var actors=new ActiveActors(db);
        service=new Profiles(db,actors,new Ranking(db,actors,id -> id),new Viewings(db),new ProfileVisibilities(db));
        db.update("insert into library(actor,title,watched,rating,review,evaluation_public) values(?,'demo-a',true,8,'Boa',true)",ANA);
        db.update("insert into library(actor,title,watched,rating,evaluation_public) values(?,'demo-b',true,3,false)",ANA);
        db.update("insert into library(actor,title,interest) values(?,'demo-c',true)",ANA);
        db.update("insert into viewing(id,actor,title,watched_on,rewatch) values('v1',?,'demo-a',date '2025-01-01',false)",ANA);
        db.update("insert into film_ranking(actor,title,tier,position) values(?,'demo-a',1,0)",ANA);
    }

    @SuppressWarnings("unchecked") static List<Map<String,Object>> list(Map<String,Object> result,String key) { return (List<Map<String,Object>>)result.get(key); }
    static List<Object> titles(Map<String,Object> result) { return list(result,"library").stream().map(item -> item.get("title")).toList(); }

    @Test void shouldReturnOwnDashboardWithPrivateEntries() {
        var me=service.me(ANA,false,null);
        assertEquals(Map.of("username","ana","name","ana","bio","","avatar",""),me.get("profile"));
        assertEquals(List.of("demo-a","demo-b","demo-c"),titles(me));
        assertEquals(3,list(me,"library").get(1).get("rating"));
        assertEquals(1,list(me,"viewings").size());
        assertEquals(false,me.get("diaryHasMore"));
        assertEquals(List.of("demo-a"),list(me,"ranking").stream().map(item -> item.get("title")).toList());
        var visibility=new LinkedHashMap<String,Object>();
        visibility.put("watchlist",false); visibility.put("ranking",false); visibility.put("watched",true); visibility.put("diary",false); visibility.put("lists",true);
        assertEquals(visibility,me.get("visibility"));
        assertEquals(List.of("watchlist","ranking","watched","diary","lists"),List.copyOf(((Map<?,?>)me.get("visibility")).keySet()));
    }

    @Test void shouldReturnOnlyTheRequestedTitleOrNoLibraryInSummary() {
        assertEquals(List.of("demo-b"),titles(service.me(ANA,false,"demo-b")));
        assertEquals(List.of(),titles(service.me(ANA,true,null)));
        assertEquals("Identificador inválido.",fails(400,() -> service.me(ANA,false,"nao valido")).getReason());
    }

    @Test void shouldSignalMissingProfilePausedAccountAndSuspension() {
        assertEquals(Map.of("needsProfile",true),service.me("novo-12345678",false,null));
        assertEquals("Sessão inválida.",fails(401,() -> service.me("x",false,null)).getReason());
        db.update("update profile set active=false where actor=?",ANA);
        assertEquals("Acesso suspenso.",fails(403,() -> service.me(ANA,false,null)).getReason());
        db.update("insert into email_account(actor,email,password_hash,state) values(?,'ana@example.com','x','paused')",ANA);
        assertEquals(Map.of("paused",true),service.me(ANA,false,null));
    }

    @Test void shouldCreateAndUpdateProfile() {
        var created=service.profile("caio-12345678",new Profiles.Profile("  Caio ","Caio","Oi","preset:cinema"));
        assertEquals("caio",((Map<?,?>)created.get("profile")).get("username"));
        assertEquals("preset:cinema",((Map<?,?>)created.get("profile")).get("avatar"));
        var updated=service.profile("caio-12345678",new Profiles.Profile("caio2","Caio S",null,null));
        assertEquals("Caio S",((Map<?,?>)updated.get("profile")).get("name"));
        assertEquals("preset:cinema",((Map<?,?>)updated.get("profile")).get("avatar"));
        assertEquals("Nome de usuário já cadastrado.",fails(409,() -> service.profile("caio-12345678",new Profiles.Profile("ana","Caio",null,null))).getReason());
        assertEquals("Campo obrigatório.",fails(400,() -> service.profile("caio-12345678",new Profiles.Profile("caio2"," ",null,null))).getReason());
        db.update("update profile set active=false where actor=?",BIA);
        assertEquals("Acesso suspenso.",fails(403,() -> service.profile(BIA,new Profiles.Profile("bia","Bia",null,null))).getReason());
    }

    @Test void shouldShowVisitorOnlyPublicSections() {
        var visit=service.publicProfile(BIA,"ana",false);
        assertEquals("ana",((Map<?,?>)visit.get("profile")).get("username"));
        assertEquals(List.of("demo-a","demo-b"),titles(visit));
        assertEquals(8,list(visit,"library").get(0).get("rating"));
        assertNull(list(visit,"library").get(1).get("rating"));
        assertFalse(list(visit,"library").get(0).containsKey("hidden"));
        assertEquals(List.of(),list(visit,"viewings"));
        assertEquals(List.of(),list(visit,"ranking"));
        db.update("update profile set show_watchlist=true,show_ranking=true,show_diary=true where actor=?",ANA);
        visit=service.publicProfile(BIA,"Ana ",false);
        assertEquals(List.of("demo-a","demo-b","demo-c"),titles(visit));
        assertEquals(1,list(visit,"viewings").size());
        assertEquals(1,list(visit,"ranking").size());
        assertEquals(visit,service.profileByName(BIA,"ana",false));
        assertEquals(List.of(),titles(service.publicProfile(BIA,"ana",true)));
    }

    @Test void shouldNotShowInactiveProfilesOrServeSuspendedVisitors() {
        assertEquals("Registro não encontrado.",fails(404,() -> service.publicProfile(BIA,"ninguem",false)).getReason());
        db.update("update profile set active=false where actor=?",BIA);
        fails(403,() -> service.publicProfile(BIA,"ana",false));
        fails(404,() -> service.publicProfile(ANA,"bia",false));
    }

    @Test void shouldToggleVisibilitySectionsAndRejectInvalidInput() {
        assertEquals(true,service.visibility(ANA,new Profiles.ProfileVisibility("diary",true)).get("diary"));
        var all=service.visibility(ANA,new Profiles.ProfileVisibility("all",false));
        assertEquals(Set.of(false),Set.copyOf(all.values()));
        assertEquals("Seção inválida.",fails(400,() -> service.visibility(ANA,new Profiles.ProfileVisibility("bio",true))).getReason());
        assertEquals("Seção inválida.",fails(400,() -> service.visibility(ANA,new Profiles.ProfileVisibility(null,true))).getReason());
        assertEquals("Seção inválida.",fails(400,() -> service.visibility(ANA,new Profiles.ProfileVisibility("diary",null))).getReason());
        db.update("update profile set active=false where actor=?",ANA);
        assertEquals("Acesso suspenso.",fails(403,() -> service.visibility(ANA,new Profiles.ProfileVisibility("diary",true))).getReason());
    }
}
