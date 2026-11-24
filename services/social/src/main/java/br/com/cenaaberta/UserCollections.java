package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Coleções (listas) do usuário: criação, edição com versão, itens ordenados e leitura pública via show_lists. */
@RestController
public class UserCollections {

    public record CollectionInput(String name,String description,Integer version) {}

    public record CollectionItems(Integer version,List<String> titles) {}

    static final int MAX_COLLECTIONS=100, MAX_ITEMS=100;

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final IdempotencyReceipts receipts;
    private final CatalogTitles catalog;

    UserCollections(JdbcTemplate db,ActiveActors actors,IdempotencyReceipts receipts,CatalogTitles catalog) {
        this.db=db; this.actors=actors; this.receipts=receipts; this.catalog=catalog;
    }

    /**
     * Lista as coleções do próprio usuário.
     * @param actor usuário da sessão
     * @return {items:[{id,name,description,version,count,titles}]}, titles = até 4 primeiras obras
     */
    @GetMapping("/me/collections")
    Map<String,Object> mine(@RequestHeader("X-Actor") String actor) {
        actors.requireActive(actor);
        return Map.of("items",summaries(actor));
    }

    /**
     * Cria uma coleção vazia; com Idempotency-Key, repetir a chamada devolve a mesma coleção.
     * @param actor usuário da sessão
     * @param key chave de repetição opcional
     * @param input nome (1..100) e descrição (0..500)
     * @return a coleção criada no formato de detalhe
     */
    @PostMapping("/me/collections")
    @Transactional
    Map<String,Object> create(@RequestHeader("X-Actor") String actor,@RequestHeader(value="Idempotency-Key",required=false) String key,
                              @RequestBody CollectionInput input) {
        actors.lockActive(actor);
        String name=required(input.name(),100), description=optional(input.description(),500);
        var body=new CollectionInput(name,description,null);
        if(key!=null) {
            String prior=receipts.find(actor,"collection",key,body);
            if(prior!=null) return detail(actor,prior);
        }
        if(db.queryForObject("select count(*) from collection where actor=?",Integer.class,actor)>=MAX_COLLECTIONS)
            fail(HttpStatus.BAD_REQUEST,"Limite de "+MAX_COLLECTIONS+" coleções.");
        String id=UUID.randomUUID().toString();
        db.update("insert into collection(id,actor,name,description) values(?,?,?,?)",id,actor,name,description);
        if(key!=null) receipts.save(actor,"collection",key,body,id);
        return detail(actor,id);
    }

    /**
     * Detalhe de uma coleção do próprio usuário.
     * @param actor usuário da sessão
     * @param id coleção
     * @return {id,name,description,version,items:[{title,position}]}; 404 se não for do usuário
     */
    @GetMapping("/me/collections/{id}")
    Map<String,Object> one(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.requireActive(actor);
        return detail(actor,id);
    }

    /**
     * Renomeia ou troca a descrição; exige a versão atual.
     * @param actor usuário da sessão
     * @param id coleção
     * @param input nome, descrição e versão lida
     * @return a coleção atualizada; 409 se a versão mudou
     */
    @PutMapping("/me/collections/{id}")
    @Transactional
    Map<String,Object> update(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody CollectionInput input) {
        actors.lockActive(actor);
        String name=required(input.name(),100), description=optional(input.description(),500);
        checkVersion(actor,id,input.version());
        db.update("update collection set name=?,description=?,version=version+1 where id=? and actor=?",name,description,id,actor);
        return detail(actor,id);
    }

    /**
     * Apaga a coleção e seus itens.
     * @param actor usuário da sessão
     * @param id coleção
     * @return {deleted:true}; 404 se não existir ou não for do usuário
     */
    @DeleteMapping("/me/collections/{id}")
    @Transactional
    Map<String,Boolean> delete(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.lockActive(actor);
        if(db.update("delete from collection where id=? and actor=?",id,actor)==0) fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");
        return Map.of("deleted",true);
    }

    /**
     * Substitui a lista inteira de obras, na ordem enviada.
     * @param actor usuário da sessão
     * @param id coleção
     * @param input versão lida e ids das obras (máx. 100, sem repetição)
     * @return a coleção atualizada; 409 se a versão mudou, 404 se uma obra nova não existe no catálogo
     */
    @PutMapping("/me/collections/{id}/items")
    @Transactional
    Map<String,Object> replaceItems(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody CollectionItems input) {
        actors.lockActive(actor);
        if(input.titles()==null || input.titles().size()>MAX_ITEMS) fail(HttpStatus.BAD_REQUEST,"Use até "+MAX_ITEMS+" obras.");
        var unique=new LinkedHashSet<String>();
        for(String title:input.titles()) {
            validateTitle(title);
            if(!unique.add(title)) fail(HttpStatus.BAD_REQUEST,"Obra repetida na coleção.");
        }
        checkVersion(actor,id,input.version());
        // Só as obras novas vão ao catálogo; as que já estavam na coleção já foram conferidas.
        var previous=new HashSet<>(db.queryForList("select title from collection_item where collection_id=?",String.class,id));
        var added=unique.stream().filter(title -> !previous.contains(title)).toList();
        if(!added.isEmpty() && !catalog.titles(added,false).keySet().containsAll(added)) fail(HttpStatus.NOT_FOUND,"Obra não encontrada.");
        db.update("delete from collection_item where collection_id=?",id);
        int position=0;
        for(String title:unique) db.update("insert into collection_item(collection_id,title,position) values(?,?,?)",id,title,position++);
        db.update("update collection set version=version+1 where id=?",id);
        return detail(actor,id);
    }

    /**
     * Coleções de outra pessoa (ou do próprio usuário), respeitando profile.show_lists.
     * @param actor usuário da sessão
     * @param username dono das coleções
     * @return mesmo formato de /me/collections; 403 se o dono escondeu as listas, 404 se não existe
     */
    @GetMapping("/collections")
    Map<String,Object> byProfile(@RequestHeader("X-Actor") String actor,@RequestParam String username) {
        actors.requireActive(actor);
        return Map.of("items",summaries(visibleOwner(actor,username)));
    }

    /**
     * Detalhe de uma coleção de qualquer pessoa, respeitando profile.show_lists do dono.
     * @param actor usuário da sessão
     * @param id coleção
     * @return detalhe com {owner:{username,name,avatar}}; 404 se não existe, 403 se o dono escondeu as listas
     */
    @GetMapping("/collections/{id}")
    Map<String,Object> publicOne(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.requireActive(actor);
        var owner=Rows.one(db,"select p.actor,p.username,p.name,p.avatar,p.show_lists from collection c join profile p on p.actor=c.actor where c.id=? and p.active=true",id);
        if(!actor.equals(owner.get("actor")) && !Boolean.TRUE.equals(owner.get("show_lists"))) fail(HttpStatus.FORBIDDEN,"Listas privadas.");
        var result=new LinkedHashMap<>(detail((String)owner.get("actor"),id));
        result.put("owner",Map.of("username",owner.get("username"),"name",owner.get("name"),"avatar",Objects.toString(owner.get("avatar"),"")));
        return result;
    }

    private String visibleOwner(String actor,String username) {
        var owner=Rows.one(db,"select actor,show_lists from profile where username=? and active=true",ProfileFields.username(username));
        if(!actor.equals(owner.get("actor")) && !Boolean.TRUE.equals(owner.get("show_lists"))) fail(HttpStatus.FORBIDDEN,"Listas privadas.");
        return (String)owner.get("actor");
    }

    private void checkVersion(String actor,String id,Integer version) {
        var row=Rows.one(db,"select version from collection where id=? and actor=? for update",id,actor);
        if(version==null || !version.equals(row.get("version"))) fail(HttpStatus.CONFLICT,"Coleção alterada. Atualize a página.");
    }

    private List<Map<String,Object>> summaries(String owner) {
        var rows=db.queryForList("""
            select c.id,c.name,c.description,c.version,(select count(*) from collection_item i where i.collection_id=c.id) as item_count
            from collection c where c.actor=? order by c.created desc,c.id limit ?
            """,owner,MAX_COLLECTIONS);
        if(rows.isEmpty()) return List.of();
        // Uma consulta para as capas de todas as coleções, em vez de uma por coleção.
        var covers=new HashMap<String,List<String>>();
        String placeholders=String.join(",",Collections.nCopies(rows.size(),"?"));
        db.queryForList("select collection_id,title from collection_item where position<4 and collection_id in ("+placeholders+") order by collection_id,position",
                rows.stream().map(row -> row.get("id")).toArray())
            .forEach(item -> covers.computeIfAbsent((String)item.get("collection_id"),k -> new ArrayList<>()).add((String)item.get("title")));
        return rows.stream().map(row -> {
            var item=new LinkedHashMap<String,Object>();
            item.put("id",row.get("id")); item.put("name",row.get("name")); item.put("description",row.get("description"));
            item.put("version",row.get("version")); item.put("count",((Number)row.get("item_count")).intValue());
            item.put("titles",covers.getOrDefault((String)row.get("id"),List.of()));
            return (Map<String,Object>)item;
        }).toList();
    }

    private Map<String,Object> detail(String owner,String id) {
        var row=Rows.one(db,"select id,name,description,version from collection where id=? and actor=?",id,owner);
        var result=new LinkedHashMap<String,Object>(row);
        result.put("items",db.queryForList("select title,position from collection_item where collection_id=? order by position",id));
        return result;
    }
}
