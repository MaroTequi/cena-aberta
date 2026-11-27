package br.com.cenaaberta;

import java.util.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Friendships.FRIENDS_OF;
import static br.com.cenaaberta.Guards.validateTitle;

/** Quais amigos aceitos viram ou querem ver uma obra, respeitando a privacidade de cada um. */
@RestController
public class TitleFriends {

    static final int LIMIT=50;

    private final JdbcTemplate db;
    private final ActiveActors actors;

    TitleFriends(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    /**
     * Amigos com relação visível com a obra.
     * @param actor usuário da sessão
     * @param id obra
     * @return {items:[{username,name,avatar,watched,interest,rating,review,spoiler}]} (até 50, por username)
     */
    @GetMapping("/titles/{id}/friends")
    Map<String,Object> friends(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.requireActive(actor);
        validateTitle(id);
        var args=new ArrayList<Object>(); args.add(id); args.addAll(List.of(Friendships.friendsOfArgs(actor)));
        var items=new ArrayList<Map<String,Object>>();
        for(var row:db.queryForList("""
                select p.username,p.name,p.avatar,p.show_watched,p.show_watchlist,l.watched,l.interest,l.rating,l.review,
                (l.evaluation_public and not l.hidden) as public_evaluation,%s as spoiler
                from library l join profile p on p.actor=l.actor
                where l.title=? and l.actor in (%s) and p.active=true order by p.username limit 500
                """.formatted(Community.EFFECTIVE_SPOILER,FRIENDS_OF),args.toArray())) {
            // Cada campo segue a regra que já vale no perfil: assistido via show_watched, Vou ver via show_watchlist, nota/resenha só se públicas.
            boolean open=Boolean.TRUE.equals(row.get("public_evaluation"));
            boolean watched=Boolean.TRUE.equals(row.get("show_watched")) && Boolean.TRUE.equals(row.get("watched"));
            boolean interest=Boolean.TRUE.equals(row.get("show_watchlist")) && Boolean.TRUE.equals(row.get("interest"));
            Object rating=open?row.get("rating"):null, review=open?row.get("review"):null;
            if(!watched && !interest && rating==null && review==null) continue;
            var item=new LinkedHashMap<String,Object>(Friendships.person(row));
            item.put("watched",watched); item.put("interest",interest); item.put("rating",rating); item.put("review",review);
            item.put("spoiler",review!=null && Boolean.TRUE.equals(row.get("spoiler")));
            items.add(item);
            if(items.size()==LIMIT) break;
        }
        return Map.of("items",items);
    }
}
