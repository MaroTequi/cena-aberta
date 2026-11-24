package br.com.cenaaberta;

import java.util.*;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Curtidas e comentários em resenhas públicas (as mesmas que aparecem em /titles/{id}/reviews). */
@RestController
public class ReviewReactions {

    public record LikeInput(String username,Boolean value) {}

    public record CommentInput(String username,String body) {}

    static final int COMMENTS_SHOWN=100;

    private final JdbcTemplate db;
    private final ActiveActors actors;

    ReviewReactions(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    /**
     * Curte (value=true) ou descurte (false) a resenha de alguém.
     * @param actor usuário da sessão
     * @param id obra
     * @param input username do autor da resenha e o valor
     * @return {likes,liked}; 403 na própria resenha, 404 se a resenha não é pública
     */
    @PutMapping("/titles/{id}/review-like")
    @Transactional
    Map<String,Object> like(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody LikeInput input) {
        actors.lockActive(actor);
        validateTitle(id);
        if(input.value()==null) fail(HttpStatus.BAD_REQUEST,"Informe se curtiu.");
        String author=publicReview(id,input.username());
        if(author.equals(actor)) fail(HttpStatus.FORBIDDEN,"Você não pode curtir a própria resenha.");
        if(!input.value()) db.update("delete from review_like where author=? and title=? and liker=?",author,id,actor);
        else if(!Rows.exists(db,"select count(*) from review_like where author=? and title=? and liker=?",author,id,actor)) {
            try { db.update("insert into review_like(author,title,liker) values(?,?,?)",author,id,actor); }
            catch(DuplicateKeyException concurrent) { /* outra aba já curtiu: o resultado é o mesmo */ }
        }
        return Map.of("likes",db.queryForObject("select count(*) from review_like where author=? and title=?",Integer.class,author,id),
            "liked",input.value());
    }

    /**
     * Comentários de uma resenha pública, do mais antigo para o mais novo (os 100 mais recentes).
     * @param actor usuário da sessão
     * @param id obra
     * @param username autor da resenha
     * @return {items:[{id,author,body,at,mine,canDelete}],total}
     */
    @GetMapping("/titles/{id}/review-comments")
    Map<String,Object> comments(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestParam String username) {
        actors.requireActive(actor);
        validateTitle(id);
        String author=publicReview(id,username);
        var rows=new ArrayList<>(db.queryForList("""
            select c.id,c.commenter,c.body,c.created,p.username,p.name,p.avatar,count(*) over() as total
            from review_comment c join profile p on p.actor=c.commenter
            where c.author=? and c.title=? and p.active=true order by c.created desc,c.id desc limit ?
            """,author,id,COMMENTS_SHOWN));
        long total=rows.isEmpty()?0:((Number)rows.getFirst().get("total")).longValue();
        java.util.Collections.reverse(rows);
        return Map.of("items",rows.stream().map(row -> item(row,actor,author)).toList(),"total",total);
    }

    /**
     * Comenta numa resenha pública.
     * @param actor usuário da sessão
     * @param id obra
     * @param input username do autor da resenha e o texto (1..1000)
     * @return o comentário criado, no mesmo formato da lista
     */
    @PostMapping("/titles/{id}/review-comments")
    @Transactional
    Map<String,Object> comment(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody CommentInput input) {
        actors.lockActive(actor);
        validateTitle(id);
        String body=required(input.body(),1000);
        String author=publicReview(id,input.username());
        String commentId=UUID.randomUUID().toString();
        db.update("insert into review_comment(id,author,title,commenter,body) values(?,?,?,?,?)",commentId,author,id,actor,body);
        return item(Rows.one(db,"""
            select c.id,c.commenter,c.body,c.created,p.username,p.name,p.avatar from review_comment c
            join profile p on p.actor=c.commenter where c.id=?
            """,commentId),actor,author);
    }

    /**
     * Apaga um comentário; pode quem comentou ou o autor da resenha.
     * @param actor usuário da sessão
     * @param id obra
     * @param commentId comentário
     * @return {deleted:true}; 404 se não existe nessa obra, 403 sem permissão
     */
    @DeleteMapping("/titles/{id}/review-comments/{commentId}")
    @Transactional
    Map<String,Boolean> deleteComment(@RequestHeader("X-Actor") String actor,@PathVariable String id,@PathVariable String commentId) {
        actors.lockActive(actor);
        validateTitle(id);
        var comment=Rows.one(db,"select author,commenter from review_comment where id=? and title=?",commentId,id);
        if(!actor.equals(comment.get("commenter")) && !actor.equals(comment.get("author"))) fail(HttpStatus.FORBIDDEN,"Você não pode apagar este comentário.");
        db.update("delete from review_comment where id=?",commentId);
        return Map.of("deleted",true);
    }

    /** Devolve o actor do autor se a resenha existe e é pública; senão 404. */
    private String publicReview(String title,String username) {
        var rows=db.queryForList("""
            select l.actor from library l join profile p on p.actor=l.actor
            where p.username=? and p.active=true and l.title=? and l.review is not null and l.evaluation_public=true and l.hidden=false
            """,String.class,ProfileFields.username(username),title);
        if(rows.isEmpty()) fail(HttpStatus.NOT_FOUND,"Resenha não encontrada.");
        return rows.getFirst();
    }

    private static Map<String,Object> item(Map<String,Object> row,String actor,String author) {
        var item=new LinkedHashMap<String,Object>();
        item.put("id",row.get("id"));
        item.put("author",Friendships.person(row));
        item.put("body",row.get("body"));
        item.put("at",Rows.instant(row.get("created")));
        boolean mine=actor.equals(row.get("commenter"));
        item.put("mine",mine);
        item.put("canDelete",mine || actor.equals(author));
        return item;
    }
}
