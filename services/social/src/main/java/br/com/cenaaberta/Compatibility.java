package br.com.cenaaberta;

import java.util.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/** Compatibilidade de gosto entre o usuário e um amigo, só com as notas públicas do amigo. */
@RestController
public class Compatibility {

    static final int MIN_SHARED=3, LIST=10;

    private final JdbcTemplate db;
    private final ActiveActors actors;

    Compatibility(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    /**
     * Compara as notas em comum.
     * @param actor usuário da sessão
     * @param username amigo aceito
     * @return {username,shared,agreement,agree,disagree}; agreement = 100 − média(|diferença|)×100/9, null se shared &lt; 3
     */
    @GetMapping("/friends/compatibility")
    Map<String,Object> compatibility(@RequestHeader("X-Actor") String actor,@RequestParam String username) {
        actors.requireActive(actor);
        var friend=Friendships.requireFriend(db,actor,username);
        var pairs=db.queryForList("""
            select m.title,m.rating as mine,t.rating as theirs from library m join library t on t.title=m.title
            where m.actor=? and t.actor=? and m.rating is not null and t.rating is not null
            and t.evaluation_public=true and t.hidden=false order by m.title
            """,actor,friend.get("actor")).stream().map(row -> {
                var pair=new LinkedHashMap<String,Object>();
                pair.put("title",row.get("title"));
                pair.put("mine",((Number)row.get("mine")).intValue());
                pair.put("theirs",((Number)row.get("theirs")).intValue());
                return pair;
            }).toList();
        double average=pairs.stream().mapToInt(Compatibility::difference).average().orElse(0);
        var result=new LinkedHashMap<String,Object>();
        result.put("username",friend.get("username"));
        result.put("shared",pairs.size());
        result.put("agreement",pairs.size()<MIN_SHARED?null:(int)Math.round(100-average*100/9));
        // Concordância = diferença de até 1 ponto (meia estrela); discordância = 3 pontos ou mais.
        result.put("agree",pairs.stream().filter(pair -> difference(pair)<=1)
            .sorted(Comparator.comparingInt(Compatibility::difference).thenComparing(pair -> -(Integer)pair.get("mine"))).limit(LIST).toList());
        result.put("disagree",pairs.stream().filter(pair -> difference(pair)>=3)
            .sorted(Comparator.comparingInt((Map<String,Object> pair) -> -difference(pair))).limit(LIST).toList());
        return result;
    }

    private static int difference(Map<String,Object> pair) { return Math.abs((Integer)pair.get("mine")-(Integer)pair.get("theirs")); }
}
