package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class UserCollectionsTest {
    static final String ANA="ana-12345678",BIA="bia-12345678";
    JdbcTemplate db; UserCollections service;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        TestDatabase.profile(db,ANA); TestDatabase.profile(db,BIA);
        var catalog=TestDatabase.catalog("""
            [{"id":"demo-a","format":"movie"},{"id":"demo-b","format":"movie"},{"id":"demo-c","format":"tv"},
             {"id":"demo-d","format":"movie"},{"id":"demo-e","format":"movie"}]""");
        service=new UserCollections(db,new ActiveActors(db),new IdempotencyReceipts(db,new ObjectMapper()),catalog);
    }

    String create(String name) { return (String)service.create(ANA,null,new UserCollections.CollectionInput(name,"desc",null)).get("id"); }

    @SuppressWarnings("unchecked") List<Map<String,Object>> items(Map<String,Object> result) { return (List<Map<String,Object>>)result.get("items"); }

    @Test void createListReplaceItemsAndShowFourCovers() {
        String id=create("  Favoritos  ");
        var detail=service.one(ANA,id);
        assertEquals("Favoritos",detail.get("name"));
        assertEquals(0,detail.get("version"));
        var updated=service.replaceItems(ANA,id,new UserCollections.CollectionItems(0,List.of("demo-e","demo-a","demo-b","demo-c","demo-d")));
        assertEquals(1,updated.get("version"));
        assertEquals(List.of("demo-e","demo-a","demo-b","demo-c","demo-d"),items(updated).stream().map(i -> i.get("title")).toList());
        var summary=items(service.mine(ANA)).getFirst();
        assertEquals(5,summary.get("count"));
        assertEquals(List.of("demo-e","demo-a","demo-b","demo-c"),summary.get("titles"));
    }

    @Test void staleVersionIs409AndRenameBumpsVersion() {
        String id=create("Lista");
        assertEquals(1,service.update(ANA,id,new UserCollections.CollectionInput("Nova","",0)).get("version"));
        fails(409,() -> service.update(ANA,id,new UserCollections.CollectionInput("Outra","",0)));
        fails(409,() -> service.replaceItems(ANA,id,new UserCollections.CollectionItems(0,List.of())));
        fails(409,() -> service.update(ANA,id,new UserCollections.CollectionInput("Outra","",null)));
    }

    @Test void invalidInputsAreRejected() {
        fails(400,() -> service.create(ANA,null,new UserCollections.CollectionInput("  ","",null)));
        fails(400,() -> service.create(ANA,null,new UserCollections.CollectionInput("x".repeat(101),"",null)));
        fails(400,() -> service.create(ANA,null,new UserCollections.CollectionInput("ok","x".repeat(501),null)));
        String id=create("Lista");
        fails(400,() -> service.replaceItems(ANA,id,new UserCollections.CollectionItems(0,List.of("demo-a","demo-a"))));
        fails(400,() -> service.replaceItems(ANA,id,new UserCollections.CollectionItems(0,List.of("../etc"))));
        fails(404,() -> service.replaceItems(ANA,id,new UserCollections.CollectionItems(0,List.of("demo-inexistente"))));
        var tooMany=new ArrayList<String>();
        for(int i=0;i<101;i++) tooMany.add("demo-x"+i);
        fails(400,() -> service.replaceItems(ANA,id,new UserCollections.CollectionItems(0,tooMany)));
    }

    @Test void onlyTheOwnerCanReadOrChangePrivateRoutes() {
        String id=create("Lista");
        fails(404,() -> service.one(BIA,id));
        fails(404,() -> service.update(BIA,id,new UserCollections.CollectionInput("x","",0)));
        fails(404,() -> service.delete(BIA,id));
        assertEquals(true,service.delete(ANA,id).get("deleted"));
        fails(404,() -> service.one(ANA,id));
    }

    @Test void idempotencyKeyReturnsTheSameCollection() {
        var input=new UserCollections.CollectionInput("Lista","",null);
        var first=service.create(ANA,"chave-12345",input);
        assertEquals(first.get("id"),service.create(ANA,"chave-12345",input).get("id"));
        assertEquals(1,items(service.mine(ANA)).size());
        fails(409,() -> service.create(ANA,"chave-12345",new UserCollections.CollectionInput("Outra","",null)));
    }

    @Test void limitOf100Collections() {
        for(int i=0;i<100;i++) db.update("insert into collection(id,actor,name,description) values(?,?,?,'')",UUID.randomUUID().toString(),ANA,"c"+i);
        fails(400,() -> create("101"));
    }

    @Test void othersSeeCollectionsOnlyWithShowLists() {
        String id=create("Lista");
        assertEquals(1,items(service.byProfile(BIA,"ana")).size());
        assertEquals("ana",((Map<?,?>)service.publicOne(BIA,id).get("owner")).get("username"));
        db.update("update profile set show_lists=false where actor=?",ANA);
        fails(403,() -> service.byProfile(BIA,"ana"));
        fails(403,() -> service.publicOne(BIA,id));
        assertEquals(1,items(service.byProfile(ANA,"ana")).size());
        fails(404,() -> service.byProfile(BIA,"ninguem"));
        db.update("update profile set active=false where actor=?",BIA);
        fails(403,() -> service.mine(BIA));
    }
}
