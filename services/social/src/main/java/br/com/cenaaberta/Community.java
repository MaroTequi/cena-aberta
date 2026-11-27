package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import static br.com.cenaaberta.Guards.*;

/** Comunidade de uma obra: resenhas públicas, médias públicas, votos de spoiler e denúncias de resenha. */
@RestController
public class Community {

    /** Spoiler efetivo da resenha em l: marcado pelo autor ou com saldo de votos de spoiler >= 2. */
    static final String EFFECTIVE_SPOILER = """
        (l.spoiler or (select coalesce(sum(case when v.contains_spoiler then 1 else -1 end),0)
        from review_spoiler_vote v where v.author=l.actor and v.title=l.title) >= 2)
        """;
    /** Voto de spoiler do usuário informado no parâmetro (?) na resenha em l; null quando não votou. */
    static final String MY_SPOILER_VOTE = """
        (select v.contains_spoiler from review_spoiler_vote v where v.author=l.actor and v.title=l.title and v.voter=?)
        """;

    private static final String FEED_SOURCE = " from library l join profile p on p.actor=l.actor "
        + "where l.review is not null and l.evaluation_public and not l.hidden and p.active ";

    private static final Set<String> REPORT_REASONS=Set.of("spoiler","harassment","hate","spam","inappropriate","off_topic","other");

    record SpoilerVote(String username, Integer version, Boolean containsSpoiler) {}

    record ReviewReport(String username,Integer version,String reason,String details) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final LibraryEntries entries;

    Community(JdbcTemplate db,ActiveActors actors,LibraryEntries entries) {
        this.db=db; this.actors=actors; this.entries=entries;
    }

    @GetMapping("/titles/{id}/reviews")
    List<Map<String,Object>> reviews(@RequestHeader("X-Actor") String actor,@PathVariable String id) {

        actors.requireActive(actor);

        validateTitle(id);
        return publicReviews(actor,id,entries.episodic(id)||SEASON_ID.matcher(id).matches());
    }

    @GetMapping("/public-review-titles")
    List<String> publicReviewTitles(){
        return db.queryForList("select distinct l.title"+FEED_SOURCE+"order by l.title",String.class);
    }

    @PostMapping("/public-release-reviews")
    List<Map<String,Object>> releaseReviews(@RequestBody List<String> ids,@RequestHeader(value="X-Actor",required=false) String viewer){
        if(ids.isEmpty()) return List.of();
        if(ids.size()>40) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var params=new ArrayList<Object>();
        params.add(viewer);params.add(viewer);params.add(viewer);params.addAll(ids);
        return db.queryForList("select l.title,p.username,p.name,p.avatar,l.review,l.review_published_at,l.version,l.actor=? as own,"
            +"case when l.title like 'tmdb-tv-%' then (select ceil(avg(s.season_score)) from "
            +"(select e.actor,e.title,e.season,floor((2.0*sum(e.rating)+count(*)-1)/(2.0*count(*))) as season_score from episode_rating e "
            +"join library ep on ep.actor=e.actor and ep.title=concat('ep-',e.title,'-s',e.season,'-e',e.episode) "
            +"where ep.evaluation_public and not ep.hidden group by e.actor,e.title,e.season) s "
            +"where s.actor=l.actor and s.title=l.title) else l.rating end as rating,"
            +"case when l.actor=? or exists(select 1 from library w where w.actor=? and w.title=l.title and w.watched) "
            +"then false else "+EFFECTIVE_SPOILER+" end as spoiler"+FEED_SOURCE
            +"and l.title in ("+String.join(",",Collections.nCopies(ids.size(),"?"))+") "
            +"order by l.review_published_at desc nulls last,l.title,p.username limit 50",params.toArray());
    }

    private List<Map<String,Object>> publicReviews(String actor,String id,boolean series) {
        return db.queryForList("select p.username,p.name,p.avatar,case when ? then null else l.rating end as rating,"
            + "l.review,l.version,"+EFFECTIVE_SPOILER+" as spoiler,"+MY_SPOILER_VOTE+" as my_vote,"
            + "(select count(*) from review_like k where k.author=l.actor and k.title=l.title) as likes,"
            + "exists(select 1 from review_like k where k.author=l.actor and k.title=l.title and k.liker=?) as liked,"
            + "(select count(*) from review_comment c join profile cp on cp.actor=c.commenter where c.author=l.actor and c.title=l.title and cp.active=true) as comments "
            + "from library l join profile p on p.actor=l.actor where l.title=? and l.review is not null "
            + "and l.evaluation_public=true and l.hidden=false and p.active=true order by p.username limit 50",series,actor,actor,id);
    }

    @PutMapping("/titles/{id}/spoiler-vote") @Transactional
    Map<String,Object> voteSpoiler(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody SpoilerVote input) {
        actors.lockActive(actor);
        validateTitle(id);
        if(input.containsSpoiler()==null || input.version()==null)fail(HttpStatus.BAD_REQUEST,"Informe o voto e a versão da resenha.");
        String author=(String)Rows.one(db,"select actor from profile where username=? and active=true",ProfileFields.username(input.username())).get("actor");
        if(author.equals(actor))fail(HttpStatus.FORBIDDEN,"Você só pode votar em resenhas de outras pessoas.");
        var review=Rows.one(db,"select version from library where actor=? and title=? and review is not null and evaluation_public and not hidden for update",author,id);
        if(!input.version().equals(review.get("version")))fail(HttpStatus.CONFLICT,"A resenha mudou. Atualize a página antes de votar.");
        if(db.update("update review_spoiler_vote set contains_spoiler=? where author=? and title=? and voter=?",input.containsSpoiler(),author,id,actor)==0)
            db.update("insert into review_spoiler_vote(author,title,voter,contains_spoiler) values(?,?,?,?)",author,id,actor,input.containsSpoiler());
        return Rows.one(db,"select "+EFFECTIVE_SPOILER+" as spoiler,"+MY_SPOILER_VOTE+" as my_vote from library l where l.actor=? and l.title=?",actor,author,id);
    }

    @PostMapping("/titles/{id}/review-report") @Transactional
    Map<String,Boolean> reportReview(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody ReviewReport input) {
        actors.requireActive(actor);
        validateTitle(id);
        String details=optional(input.details(),500);
        if(input.version()==null||input.version()<0||input.reason()==null||!REPORT_REASONS.contains(input.reason())
            || ("other".equals(input.reason())&&details.isBlank()))
            fail(HttpStatus.BAD_REQUEST,"Escolha um motivo e descreva o problema ao selecionar Outro.");
        String author=(String)Rows.one(db,"select actor from profile where username=? and active=true",ProfileFields.username(input.username())).get("actor");
        if(author.equals(actor))fail(HttpStatus.FORBIDDEN,"Você só pode reportar resenhas de outras pessoas.");
        db.queryForList("select actor from profile where actor in (?,?) order by actor for update",actor,author);
        actors.requireActive(actor);
        actors.requireActive(author);
        if(Rows.exists(db,"select count(*) from review_report where reporter=? and author=? and title=? and review_version=?",actor,author,id,input.version()))
            return Map.of("reported",true);
        var review=Rows.one(db,"select version,review from library where actor=? and title=? and review is not null and evaluation_public and not hidden for update",author,id);
        if(!input.version().equals(review.get("version")))
            fail(HttpStatus.CONFLICT,"A resenha mudou. Atualize a página antes de reportar.");
        if(db.queryForObject("select count(*) from review_report where reporter=? and created>?",Integer.class,actor,OffsetDateTime.now().minusDays(1))>=10)
            fail(HttpStatus.TOO_MANY_REQUESTS,"Limite de 10 denúncias por dia.");
        db.update("insert into review_report(id,reporter,author,title,review_version,review_text,reason,details) values(?,?,?,?,?,?,?,?)",
            UUID.randomUUID().toString(),actor,author,id,input.version(),review.get("review"),input.reason(),details);
        return Map.of("reported",true);
    }

    @GetMapping("/titles/{id}/community")
    Map<String,Object> community(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.requireActive(actor);
        validateTitle(id);
        var seasonKey=SEASON_ID.matcher(id);
        boolean season=seasonKey.matches();
        boolean series=entries.episodic(id);
        Map<String,Object> result;
        if(season) {
            var totals=db.queryForMap("""
                select count(distinct e.actor) as rating_count,count(*) as episode_rating_count,coalesce(sum(e.rating),0) as total
                from episode_rating e
                join library series on series.actor=e.actor and series.title=e.title
                join library ep on ep.actor=e.actor and ep.title=concat('ep-',e.title,'-s',e.season,'-e',e.episode)
                join profile p on p.actor=e.actor
                where e.title=? and e.season=? and series.evaluation_public and not series.hidden
                    and ep.evaluation_public and not ep.hidden and p.active
                """,seasonKey.group(1),Integer.parseInt(seasonKey.group(2)));
            result=new HashMap<>(totals);
            long sum=((Number)result.remove("total")).longValue();
            result.put("average",Episodes.roundedEpisodeAverage(sum,((Number)result.get("episode_rating_count")).longValue()));
        } else if(series) {
            var publicEpisodes=db.queryForList("""
                select e.actor,e.season,e.rating from episode_rating e
                join library l on l.actor=e.actor and l.title=e.title
                join library ep on ep.actor=e.actor and ep.title=concat('ep-',e.title,'-s',e.season,'-e',e.episode)
                join profile p on p.actor=e.actor
                where e.title=? and l.evaluation_public=true and l.hidden=false
                    and ep.evaluation_public=true and ep.hidden=false and p.active=true
                """,id);
            var bySeason=new TreeMap<Integer,IntSummaryStatistics>();
            var viewers=new HashSet<>();
            for(var episode:publicEpisodes) {
                viewers.add(episode.get("actor"));
                bySeason.computeIfAbsent((Integer)episode.get("season"),key->new IntSummaryStatistics())
                    .accept((Integer)episode.get("rating"));
            }
            var seasons=bySeason.entrySet().stream().map(item->Map.<String,Object>of(
                "season",item.getKey(),"average",Episodes.roundedEpisodeAverage(item.getValue().getSum(),item.getValue().getCount()))).toList();
            var scores=bySeason.values().stream().mapToInt(stats->Episodes.seasonHalfStars(stats.getSum(),stats.getCount())).summaryStatistics();
            result=new HashMap<>();
            result.put("rating_count",viewers.size());
            result.put("episode_rating_count",publicEpisodes.size());
            result.put("average",scores.getCount()==0?null:Episodes.seriesHalfStars(scores)/2.0);
            result.put("seasons",seasons);
        } else {
            result=new HashMap<>(db.queryForMap("""
                select count(l.rating) as rating_count, avg(cast(l.rating as decimal(8,4)))/2 as average
                from library l join profile p on p.actor=l.actor
                where l.title=? and l.evaluation_public=true and l.hidden=false and p.active=true
                """,id));
        }
        result.put("reviews",publicReviews(actor,id,series||season));
        return result;
    }
}
