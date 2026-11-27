package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Ranking pessoal de obras por categoria (tier), com versão para controle de concorrência. */
@RestController
public class Ranking {

    public record RankedFilm(String title,Integer tier) {}

    public record RankingChange(Integer version,List<RankedFilm> items) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final TitleVerifier titles;

    Ranking(JdbcTemplate db,ActiveActors actors,TitleVerifier titles) { this.db=db; this.actors=actors; this.titles=titles; }

    @GetMapping("/me/ranking")

    Map<String,Object> ranking(@RequestHeader("X-Actor") String actor) {

        actors.requireActive(actor);

        return Map.of("version",db.queryForObject("select ranking_version from profile where actor=?",Integer.class,actor),

            "items",manualRanking(actor),"automatic",seriesRanking(actor,false));

    }



    List<Map<String,Object>> manualRanking(String actor) {
        return db.queryForList("select title,tier from film_ranking where actor=? order by tier,position",actor);
    }

    List<Map<String,Object>> seriesRanking(String actor,boolean publicOnly) {
        String publicFilter=publicOnly?"and l.evaluation_public and not l.hidden and ep.evaluation_public and not ep.hidden ":"";
        var seasons=db.queryForList("""
            select e.title,e.season,sum(e.rating) as total,count(*) as votes
            from episode_rating e
            join library l on l.actor=e.actor and l.title=e.title and l.watched
            join library ep on ep.actor=e.actor and ep.title=concat('ep-',e.title,'-s',e.season,'-e',e.episode)
            where e.actor=?
            """+publicFilter+"group by e.title,e.season order by e.title,e.season",actor);
        var scores=new TreeMap<String,IntSummaryStatistics>();
        for(var season:seasons) {
            int score=Episodes.seasonHalfStars(((Number)season.get("total")).longValue(),((Number)season.get("votes")).longValue());
            scores.computeIfAbsent((String)season.get("title"),id->new IntSummaryStatistics()).accept(score);
        }
        return scores.entrySet().stream().map(item->{
            int score=Episodes.seriesHalfStars(item.getValue());
            int tier=5-(score+1)/2;
            return Map.<String,Object>of("title",item.getKey(),"tier",tier,"average",score/2.0);
        }).sorted(Comparator.comparingDouble((Map<String,Object> item)->((Number)item.get("average")).doubleValue()).reversed())
            .toList();
    }

    @PutMapping("/me/ranking")

    @Transactional

    Map<String,Object> saveRanking(@RequestHeader("X-Actor") String actor,@RequestBody RankingChange input) {

        actors.lockActive(actor);

        Integer version=db.queryForObject("select ranking_version from profile where actor=?",Integer.class,actor);

        if(input.items()==null || input.items().size()>100) fail(HttpStatus.BAD_REQUEST,"Use até 100 obras.");
        if(!Objects.equals(version,input.version())) {
            if(input.version()!=null && input.version()==version-1 && input.items().stream()
                    .allMatch(item->item!=null && item.title()!=null && item.tier()!=null)) {
                var requested=input.items().stream().sorted(Comparator.comparing(RankedFilm::tier))
                    .map(item->Map.of("title",item.title(),"tier",item.tier())).toList();
                var current=ranking(actor);
                if(requested.equals(current.get("items")))return current;
            }
            fail(HttpStatus.CONFLICT,"Ranking alterado. Recarregue antes de editar.");
        }

        Set<String> used=new HashSet<>();

        List<String> previous=db.queryForList("select title from film_ranking where actor=?",String.class,actor);

        for(var item:input.items()) {

            if(item==null || item.tier()==null || item.tier()<0 || item.tier()>4 || !used.add(item.title()))

                fail(HttpStatus.BAD_REQUEST,"Ranking inválido.");

            if(item.title()==null || SEASON_ID.matcher(item.title()).matches())fail(HttpStatus.BAD_REQUEST,"Temporadas não entram no ranking.");
            if(!Rows.exists(db,"select count(*) from library where actor=? and title=? and watched=true",actor,item.title()))

                fail(HttpStatus.BAD_REQUEST,"Adicione apenas obras marcadas como assistidas.");

            if(!previous.contains(item.title())&&"tv".equals(titles.verify(item.title())))
                fail(HttpStatus.BAD_REQUEST,"A categoria da série vem da média das temporadas.");

        }

        db.update("delete from film_ranking where actor=?",actor);

        int[] positions=new int[5];

        for(var item:input.items())db.update("insert into film_ranking values(?,?,?,?)",actor,item.title(),item.tier(),positions[item.tier()]++);

        db.update("update profile set ranking_version=ranking_version+1 where actor=?",actor);

        return ranking(actor);

    }



    public record TierChange(Integer tier) {}

    @PutMapping("/me/ranking/{title}")
    @Transactional
    Map<String,Object> rankTitle(@RequestHeader("X-Actor") String actor,@PathVariable String title,@RequestBody TierChange input) {
        actors.lockActive(actor);
        validateTitle(title);
        Integer tier=input.tier();
        if(tier==null || tier< -1 || tier>4)fail(HttpStatus.BAD_REQUEST,"Categoria inválida.");
        var current=db.queryForList("select tier from film_ranking where actor=? and title=?",Integer.class,actor,title);
        if((current.isEmpty() && tier==-1) || (!current.isEmpty() && current.getFirst().equals(tier)))return ranking(actor);
        if(tier>=0) {
            if(SEASON_ID.matcher(title).matches())fail(HttpStatus.BAD_REQUEST,"Temporadas não entram no ranking.");
            if(title.startsWith("tmdb-tv-") || (title.startsWith("demo-") && "tv".equals(titles.verify(title))))fail(HttpStatus.BAD_REQUEST,"A categoria da série vem da média das temporadas.");
            if(!Rows.exists(db,"select count(*) from library where actor=? and title=? and watched=true",actor,title))
                fail(HttpStatus.BAD_REQUEST,"Marque a obra como assistida para colocá-la no ranking.");
            if(current.isEmpty() && db.queryForObject("select count(*) from film_ranking where actor=?",Integer.class,actor)>=100)
                fail(HttpStatus.BAD_REQUEST,"Use até 100 obras.");
        }
        db.update("delete from film_ranking where actor=? and title=?",actor,title);
        if(tier>=0) {
            int position=db.queryForObject("select coalesce(max(position)+1,0) from film_ranking where actor=? and tier=?",Integer.class,actor,tier);
            db.update("insert into film_ranking(actor,title,tier,position) values(?,?,?,?)",actor,title,tier,position);
        }
        db.update("update profile set ranking_version=ranking_version+1 where actor=?",actor);
        return ranking(actor);
    }

}
