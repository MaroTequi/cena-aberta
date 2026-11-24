package br.com.cenaaberta;

import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Friendships.FRIENDS_OF;
import static br.com.cenaaberta.Guards.*;

/** Feed de atividade dos amigos aceitos: sessões do diário, notas e resenhas públicas. */
@RestController
public class Feed {

    static final int PAGE=20;
    /** Sessão registrada com data mais antiga que isso (em relação ao cursor) não entra: evita que importações inundem o feed. */
    static final int RECENT_DAYS=60;

    private final JdbcTemplate db;
    private final ActiveActors actors;

    Feed(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    /**
     * Página do feed, do mais novo para o mais antigo.
     * @param actor usuário da sessão
     * @param before cursor opaco devolvido em next (instante|tipo|usuário|id da sessão|título); ausente = agora
     * @return {items:[{kind,actor,title,rating,review,spoiler,at}],next}; next = cursor da próxima página ou null
     */
    @GetMapping("/feed")
    Map<String,Object> feed(@RequestHeader("X-Actor") String actor,@RequestParam(required=false) String before) {
        actors.requireActive(actor);
        OffsetDateTime cursor=null;
        // Desempate estável na ordem at desc, kind, username, sid, title: sem ele, itens no mesmo instante
        // (importação do Letterboxd grava várias sessões com o mesmo created) sumiriam na virada de página.
        String[] tie={"","","",""};
        try {
            if(before==null) cursor=OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(1);
            else {
                var parts=before.split("\\|",5);
                cursor=OffsetDateTime.parse(parts[0]);
                if(parts.length==5) tie=new String[]{parts[1],parts[2],parts[3],parts[4]};
                else if(parts.length>1) fail(HttpStatus.BAD_REQUEST,"Cursor inválido.");
            }
        }
        catch(DateTimeParseException invalid) { fail(HttpStatus.BAD_REQUEST,"Cursor inválido."); }
        LocalDate oldest=cursor.atZoneSameInstant(DIARY_ZONE).toLocalDate().minusDays(RECENT_DAYS);
        var args=new ArrayList<Object>();
        args.addAll(List.of(Friendships.friendsOfArgs(actor))); addAfter(args,cursor,tie); args.add(oldest); args.add(PAGE+1);
        args.addAll(List.of(Friendships.friendsOfArgs(actor))); addAfter(args,cursor,tie); args.add(PAGE+1);
        args.addAll(List.of(Friendships.friendsOfArgs(actor))); addAfter(args,cursor,tie); args.add(PAGE+1);
        args.add(PAGE+1);
        // Cada fonte já vem limitada e ordenada; a união só intercala as três e corta de novo.
        // watched exige show_diary porque revela a data da sessão, que hoje só aparece com o diário público.
        // rated/reviewed exigem avaliação pública (evaluation_public e não oculta), a mesma regra da comunidade.
        var rows=db.queryForList("""
            select * from (
              select 'watched' as kind,p.username,p.name,p.avatar,v.title,cast(null as integer) as rating,cast(null as varchar(3000)) as review,
                false as spoiler,coalesce(v.watched_at,v.created) as at,v.id as sid
              from viewing v join profile p on p.actor=v.actor
              where v.actor in (%1$s) and p.active=true and p.show_diary=true
                and %3$s and (v.watched_on is null or v.watched_on>=?)
              order by at desc,p.username,v.id,v.title limit ?) w
            union all
            select * from (
              select 'rated' as kind,p.username,p.name,p.avatar,l.title,l.rating,cast(null as varchar(3000)) as review,false as spoiler,l.rated_at as at,'' as sid
              from library l join profile p on p.actor=l.actor
              where l.actor in (%1$s) and p.active=true and l.rating is not null and l.rated_at is not null
                and l.evaluation_public=true and l.hidden=false and %4$s
              order by at desc,p.username,l.title limit ?) r
            union all
            select * from (
              select 'reviewed' as kind,p.username,p.name,p.avatar,l.title,l.rating,l.review,%2$s as spoiler,l.reviewed_at as at,'' as sid
              from library l join profile p on p.actor=l.actor
              where l.actor in (%1$s) and p.active=true and l.review is not null and l.reviewed_at is not null
                and l.evaluation_public=true and l.hidden=false and %5$s
              order by at desc,p.username,l.title limit ?) c
            order by at desc,kind,username,sid,title limit ?
            """.formatted(FRIENDS_OF,Social.EFFECTIVE_SPOILER,
                after("coalesce(v.watched_at,v.created)","'watched'","p.username","v.id","v.title"),
                after("l.rated_at","'rated'","p.username","''","l.title"),
                after("l.reviewed_at","'reviewed'","p.username","''","l.title")),args.toArray());
        var items=rows.stream().limit(PAGE).map(row -> {
            var item=new LinkedHashMap<String,Object>();
            item.put("kind",row.get("kind"));
            item.put("actor",Friendships.person(row));
            item.put("title",row.get("title"));
            item.put("rating",row.get("rating"));
            item.put("review",row.get("review"));
            item.put("spoiler",Boolean.TRUE.equals(row.get("spoiler")));
            item.put("at",Rows.instant(row.get("at")));
            return (Map<String,Object>)item;
        }).toList();
        var result=new LinkedHashMap<String,Object>();
        result.put("items",items);
        result.put("next",rows.size()>PAGE?cursorOf(rows.get(PAGE-1)):null);
        return result;
    }

    /** Condição "vem depois do cursor" na ordem at desc,kind,username,sid,title (comparação de tupla escrita à mão: H2 e PostgreSQL a aceitam igual). */
    private static String after(String at,String kind,String username,String sid,String title) {
        return "("+at+"<? or ("+at+"=? and ("+kind+">? or ("+kind+"=? and ("+username+">? or ("+username+"=? and ("
            +sid+">? or ("+sid+"=? and "+title+">?))))))))";
    }

    /** Parâmetros de {@link #after}, na mesma ordem em que os marcadores aparecem. */
    private static void addAfter(List<Object> args,OffsetDateTime at,String[] tie) {
        args.add(at); args.add(at);
        args.add(tie[0]); args.add(tie[0]);
        args.add(tie[1]); args.add(tie[1]);
        args.add(tie[2]); args.add(tie[2]);
        args.add(tie[3]);
    }

    private static String cursorOf(Map<String,Object> row) {
        return Rows.instant(row.get("at"))+"|"+row.get("kind")+"|"+row.get("username")+"|"+row.get("sid")+"|"+row.get("title");
    }
}
