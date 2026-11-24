package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Recomendações de obras entre amigos aceitos; as não lidas aparecem em /notifications. */
@RestController
public class Recommendations {

    public record RecommendationInput(String recipient,String title,String message) {}

    static final int DAILY_LIMIT=30, PAGE=50;

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final CatalogTitles catalog;

    Recommendations(JdbcTemplate db,ActiveActors actors,CatalogTitles catalog) { this.db=db; this.actors=actors; this.catalog=catalog; }

    /**
     * Recomenda uma obra a um amigo. Repetir a mesma obra para a mesma pessoa devolve a recomendação existente sem alterá-la
     * (evita notificar de novo e torna a chamada segura para repetir).
     * @param actor usuário da sessão
     * @param input username do amigo, obra e mensagem opcional (até 300)
     * @return {id,recipient,title,titleName,message,created,duplicate}
     */
    @PostMapping("/recommendations")
    @Transactional
    Map<String,Object> recommend(@RequestHeader("X-Actor") String actor,@RequestBody RecommendationInput input) {
        actors.lockActive(actor);
        validateTitle(input.title());
        String message=optional(input.message(),300);
        var friend=Friendships.requireFriend(db,actor,input.recipient());
        String recipient=(String)friend.get("actor");
        var existing=db.queryForList("select id from recommendation where sender=? and recipient=? and title=?",String.class,actor,recipient,input.title());
        if(!existing.isEmpty()) return sent(existing.getFirst(),friend,true);
        if(db.queryForObject("select count(*) from recommendation where sender=? and created>?",Integer.class,actor,OffsetDateTime.now(ZoneOffset.UTC).minusHours(24))>=DAILY_LIMIT)
            fail(HttpStatus.TOO_MANY_REQUESTS,"Limite de "+DAILY_LIMIT+" recomendações por dia.");
        // O nome fica guardado para a notificação não depender do catálogo a cada consulta do sino.
        var title=catalog.titles(List.of(input.title()),false).get(input.title());
        if(title==null) fail(HttpStatus.NOT_FOUND,"Obra não encontrada.");
        String name=title.path("name").asText(input.title());
        String id=UUID.randomUUID().toString();
        db.update("insert into recommendation(id,sender,recipient,title,title_name,message) values(?,?,?,?,?,?)",
            id,actor,recipient,input.title(),name.length()>300?name.substring(0,300):name,message.isBlank()?null:message);
        return sent(id,friend,false);
    }

    /**
     * Recomendações recebidas, mais novas primeiro, só de remetentes ativos.
     * @param actor usuário da sessão
     * @param offset deslocamento (0..100000), páginas de 50
     * @return {items:[{id,sender,title,titleName,message,created,seen}],unseen,hasMore}
     */
    @GetMapping("/recommendations")
    Map<String,Object> received(@RequestHeader("X-Actor") String actor,@RequestParam(defaultValue="0") int offset) {
        actors.requireActive(actor);
        if(offset<0 || offset>100000) fail(HttpStatus.BAD_REQUEST,"Página inválida.");
        var rows=db.queryForList("""
            select r.id,r.title,r.title_name,r.message,r.created,r.seen,p.username,p.name,p.avatar
            from recommendation r join profile p on p.actor=r.sender
            where r.recipient=? and p.active=true order by r.created desc,r.id limit ? offset ?
            """,actor,PAGE+1,offset);
        var items=rows.stream().limit(PAGE).map(row -> {
            var item=new LinkedHashMap<String,Object>();
            item.put("id",row.get("id"));
            item.put("sender",Friendships.person(row));
            item.put("title",row.get("title"));
            item.put("titleName",row.get("title_name"));
            item.put("message",row.get("message"));
            item.put("created",Rows.instant(row.get("created")));
            item.put("seen",row.get("seen"));
            return (Map<String,Object>)item;
        }).toList();
        int unseen=db.queryForObject("select count(*) from recommendation r join profile p on p.actor=r.sender where r.recipient=? and r.seen=false and p.active=true",Integer.class,actor);
        return Map.of("items",items,"unseen",unseen,"hasMore",rows.size()>PAGE);
    }

    /**
     * Marca uma recomendação recebida como lida (some do sino).
     * @param actor usuário da sessão
     * @param id recomendação
     * @return {read:true}; 404 se não existe ou não foi enviada ao usuário
     */
    @PutMapping("/recommendations/{id}/read")
    @Transactional
    Map<String,Boolean> read(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.requireActive(actor);
        if(db.update("update recommendation set seen=true where id=? and recipient=?",id,actor)==0) fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");
        return Map.of("read",true);
    }

    private Map<String,Object> sent(String id,Map<String,Object> friend,boolean duplicate) {
        var row=Rows.one(db,"select id,title,title_name,message,created from recommendation where id=?",id);
        var result=new LinkedHashMap<String,Object>();
        result.put("id",row.get("id"));
        result.put("recipient",Friendships.person(friend));
        result.put("title",row.get("title"));
        result.put("titleName",row.get("title_name"));
        result.put("message",row.get("message"));
        result.put("created",Rows.instant(row.get("created")));
        result.put("duplicate",duplicate);
        return result;
    }
}
