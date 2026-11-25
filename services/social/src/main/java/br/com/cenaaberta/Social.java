package br.com.cenaaberta;



import java.net.URI;

import java.net.http.*;

import java.nio.charset.StandardCharsets;

import java.security.MessageDigest;

import java.time.*;

import java.util.*;

import com.fasterxml.jackson.annotation.JsonInclude;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Value;

import org.springframework.boot.*;

import org.springframework.boot.autoconfigure.SpringBootApplication;

import org.springframework.dao.DuplicateKeyException;

import org.springframework.http.HttpStatus;

import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.transaction.annotation.Transactional;

import org.springframework.web.bind.annotation.*;

import org.springframework.web.server.ResponseStatusException;



@SpringBootApplication

@RestController

public class Social {

    private static final ZoneId DIARY_ZONE=ZoneId.of("America/Sao_Paulo");

    public record Profile(String username,String name,String bio,String avatar) {}

    public record RankedFilm(String title,Integer tier) {}

    public record RankingChange(Integer version,List<RankedFilm> items) {}

    public record LibraryChange(Boolean value,Integer rating,String review,Boolean spoiler,Integer version) {}

    public record Viewing(String title,LocalDate date,boolean rewatch,

                          @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime watchedAt) {}


    private final JdbcTemplate db;

    private final ObjectMapper mapper;

    private final String secret, catalogKey, catalog;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();



    public static void main(String[] args) { SpringApplication.run(Social.class,args); }



    Social(JdbcTemplate db,ObjectMapper mapper,@Value("${internal.secret}") String secret,

           @Value("${CATALOG_INTERNAL_SECRET}") String catalogKey,

           @Value("${CATALOG_URL:http://127.0.0.1:8181}") String catalog) {

        this.db=db; this.mapper=mapper; this.secret=secret; this.catalogKey=catalogKey; this.catalog=catalog;

        if (secret.length()<24 || catalogKey.length()<24) throw new IllegalArgumentException("Chaves internas precisam de pelo menos 24 caracteres");

    }



    @ModelAttribute

    void verify(HttpServletRequest request) {

        if (request.getRequestURI().equals("/health")) return;

        String actual=request.getHeader("X-Internal-Key");

        if(actual==null || !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),actual.getBytes(StandardCharsets.UTF_8)))

            fail(HttpStatus.UNAUTHORIZED,"Acesso interno necessário.");

    }



    @GetMapping("/health") Map<String,String> health() { db.queryForObject("select 1",Integer.class); return Map.of("status","ok"); }



    @GetMapping("/me/ranking")

    Map<String,Object> ranking(@RequestHeader("X-Actor") String actor) {

        active(actor);

        return Map.of("version",db.queryForObject("select ranking_version from profile where actor=?",Integer.class,actor),

            "items",manualRanking(actor),"automatic",seriesRanking(actor,false));

    }



    private List<Map<String,Object>> manualRanking(String actor) {
        return db.queryForList("select title,tier from film_ranking where actor=? order by tier,position",actor);
    }

    private List<Map<String,Object>> seriesRanking(String actor,boolean publicOnly) {
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
            int score=seasonHalfStars(((Number)season.get("total")).longValue(),((Number)season.get("votes")).longValue());
            scores.computeIfAbsent((String)season.get("title"),id->new IntSummaryStatistics()).accept(score);
        }
        return scores.entrySet().stream().map(item->{
            int score=seriesHalfStars(item.getValue());
            int tier=5-(score+1)/2;
            return Map.<String,Object>of("title",item.getKey(),"tier",tier,"average",score/2.0);
        }).sorted(Comparator.comparingDouble((Map<String,Object> item)->((Number)item.get("average")).doubleValue()).reversed())
            .toList();
    }

    @PutMapping("/me/ranking")

    @Transactional

    Map<String,Object> saveRanking(@RequestHeader("X-Actor") String actor,@RequestBody RankingChange input) {

        lockActive(actor);

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
            if(!exists("select count(*) from library where actor=? and title=? and watched=true",actor,item.title()))

                fail(HttpStatus.BAD_REQUEST,"Adicione apenas obras marcadas como assistidas.");

            if(!previous.contains(item.title())&&"tv".equals(verifyTitle(item.title())))
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
        lockActive(actor);
        validateTitle(title);
        Integer tier=input.tier();
        if(tier==null || tier< -1 || tier>4)fail(HttpStatus.BAD_REQUEST,"Categoria inválida.");
        var current=db.queryForList("select tier from film_ranking where actor=? and title=?",Integer.class,actor,title);
        if((current.isEmpty() && tier==-1) || (!current.isEmpty() && current.getFirst().equals(tier)))return ranking(actor);
        if(tier>=0) {
            if(SEASON_ID.matcher(title).matches())fail(HttpStatus.BAD_REQUEST,"Temporadas não entram no ranking.");
            if(episodic(title))fail(HttpStatus.BAD_REQUEST,"A categoria da série vem da média das temporadas.");
            if(!exists("select count(*) from library where actor=? and title=? and watched=true",actor,title))
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

    public record EpisodeRating(Integer rating) {}



    @GetMapping("/me/episodes/{title}")
    List<Map<String,Object>> mySeasonAverages(@RequestHeader("X-Actor") String actor,@PathVariable String title) {
        active(actor);
        validateTitle(title);
        return db.queryForList("""
            select season,sum(rating) as total,count(*) as votes
            from episode_rating where actor=? and title=? group by season order by season
            """,actor,title).stream().map(row->Map.<String,Object>of("season",row.get("season"),
                "average",roundedEpisodeAverage(((Number)row.get("total")).longValue(),((Number)row.get("votes")).longValue())))
            .toList();
    }

    @GetMapping("/me/episodes/{title}/{season}")

    List<Map<String,Object>> episodeRatings(@RequestHeader("X-Actor") String actor,

            @PathVariable String title,@PathVariable int season) {

        active(actor);

        return db.queryForList("select episode,rating from episode_rating where actor=? and title=? and season=?",actor,title,season);

    }



    @PutMapping("/me/episodes/{title}/{season}/{episode}")

    @Transactional

    void rateEpisode(@RequestHeader("X-Actor") String actor,@PathVariable String title,

            @PathVariable int season,@PathVariable int episode,@RequestBody EpisodeRating input) {

        lockActive(actor);

        validateTitle(title);

        if(EPISODE_ID.matcher(title).matches()||SEASON_ID.matcher(title).matches()||season<0||season>1000||episode<1||episode>999999999||input.rating()!=null&&(input.rating()<1||input.rating()>10))

            fail(HttpStatus.BAD_REQUEST,"Episódio ou nota inválidos.");

        if(!seasonEpisodes(title,season).contains(episode))fail(HttpStatus.NOT_FOUND,"Episódio não encontrado.");
        String episodeId="ep-"+title+"-s"+season+"-e"+episode;
        if(input.rating()!=null && !exists("select count(*) from library where actor=? and title=?",actor,episodeId)) {
            createLibraryEntry(actor,episodeId,title);
        }
        db.update("update library set rating=? where actor=? and title=?",input.rating(),actor,episodeId);
        if(input.rating()!=null)mark(actor,episodeId);
        saveEpisodeRating(actor,title,season,episode,input.rating());
    }

    private Set<Integer> seasonEpisodes(String series,int season) {
        validateTitle(series);
        if(SEASON_ID.matcher(series).matches()||EPISODE_ID.matcher(series).matches()||season<0||season>1000)
            fail(HttpStatus.BAD_REQUEST,"Temporada inválida.");
        return catalogNumbers("/titles/"+series+"/seasons/"+season,"number",1,999999999);
    }

    private Set<Integer> catalogNumbers(String path,String field,int minimum,int maximum) {
        try {
            var response=http.send(HttpRequest.newBuilder(URI.create(catalog+path))
                .timeout(Duration.ofSeconds(5)).header("X-Internal-Key",catalogKey).GET().build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200)
                fail(response.statusCode()==404?HttpStatus.NOT_FOUND:HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível consultar o catálogo da série.");
            Set<Integer> numbers=new LinkedHashSet<>();
            for(var item:mapper.readTree(response.body())) {
                var value=item.path(field);
                if(value.isIntegralNumber()&&value.canConvertToInt()&&value.asInt()>=minimum&&value.asInt()<=maximum)
                    numbers.add(value.asInt());
            }
            return numbers;
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        } catch(java.io.IOException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    record SeasonProgress(int watched,int total,Double average,boolean rewatched,boolean complete) {}

    @GetMapping("/me/season-progress/{series}/{season}")
    SeasonProgress seasonProgress(@RequestHeader("X-Actor") String actor,@PathVariable String series,@PathVariable int season) {
        active(actor);
        return seasonProgress(actor,series,season,seasonEpisodes(series,season));
    }

    @GetMapping("/me/series-progress/{series}")
    Map<String,Boolean> seriesProgress(@RequestHeader("X-Actor") String actor,@PathVariable String series) {
        active(actor);
        validateTitle(series);
        if(!episodic(series))fail(HttpStatus.BAD_REQUEST,"Série inválida.");
        var seasons=catalogNumbers("/titles/"+series+"/seasons","number",0,1000);
        if(seasons.isEmpty())return Map.of("complete",false);

        String episodePrefix="ep-"+series+"-s";
        var watchedAndRated=new HashSet<>(db.queryForList("""
            select title from library where actor=? and watched=true and rating is not null and title like ?
            """,String.class,actor,episodePrefix+"%"));
        var seasonPrefixes=seasons.stream().map(season->episodePrefix+season+"-e").toList();
        if(seasonPrefixes.stream().anyMatch(prefix->watchedAndRated.stream().noneMatch(id->id.startsWith(prefix))))
            return Map.of("complete",false);

        return Map.of("complete",seasons.stream().allMatch(season->
            allEpisodesMatch(episodePrefix+season+"-e",seasonEpisodes(series,season),watchedAndRated)));
    }

    private SeasonProgress seasonProgress(String actor,String series,int season,Set<Integer> episodes) {
        String prefix="ep-"+series+"-s"+season+"-e";
        var watched=watchedEpisodes(actor,prefix);
        int count=(int)episodes.stream().filter(number->watched.contains(prefix+number)).count();
        var ratings=db.query("select episode,rating from episode_rating where actor=? and title=? and season=?",
            (row,index)->Map.entry(row.getInt("episode"),row.getInt("rating")),actor,series,season);
        var rated=ratings.stream().map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet());
        boolean complete=!episodes.isEmpty()&&count==episodes.size()&&rated.containsAll(episodes);
        return new SeasonProgress(count,episodes.size(),roundedEpisodeAverage(ratings.stream().mapToInt(Map.Entry::getValue).sum(),ratings.size()),
            seasonRewatched(actor,prefix,episodes),complete);
    }

    private boolean seasonRewatched(String actor,String prefix,Set<Integer> episodes) {
        return allEpisodesMatch(prefix,episodes,repeatedViewings(actor,prefix));
    }

    private static boolean allEpisodesMatch(String prefix,Set<Integer> episodes,Set<String> eligible) {
        return !episodes.isEmpty()&&episodes.stream().allMatch(number->eligible.contains(prefix+number));
    }

    private Set<String> repeatedViewings(String actor,String prefix) {
        return new HashSet<>(db.queryForList("""
            select title from viewing where actor=? and title like ?
            group by title having count(*)>=2
            """,String.class,actor,prefix+"%"));
    }

    private Set<String> watchedEpisodes(String actor,String prefix) {
        return new HashSet<>(db.queryForList("select title from library where actor=? and watched=true and title like ?",String.class,actor,prefix+"%"));
    }

    private static Double roundedEpisodeAverage(long sum,long count) {
        if(count==0)return null;
        // As notas são inteiras de 1 a 10. No ponto médio, mantenha a meia estrela inferior.
        return seasonHalfStars(sum,count)/2.0;
    }

    private static int seasonHalfStars(long sum,long count) {
        return (int)((2*sum+count-1)/(2*count));
    }

    private static int seriesHalfStars(IntSummaryStatistics seasons) {
        return (int)((seasons.getSum()+seasons.getCount()-1)/seasons.getCount());
    }

    private void saveEpisodeRating(String actor,String title,int season,int episode,Integer rating) {
        db.update("delete from episode_rating where actor=? and title=? and season=? and episode=?",actor,title,season,episode);
        if(rating!=null) {
            db.update("insert into episode_rating values(?,?,?,?,?)",actor,title,season,episode,rating);
            if(!exists("select count(*) from library where actor=? and title=?",actor,title))
                db.update("insert into library(actor,title,evaluation_public,spoiler) values(?,?,true,false)",actor,title);
            mark(actor,title);
        }
    }

    @GetMapping("/me") Map<String,Object> me(@RequestHeader("X-Actor") String actor, @RequestParam(defaultValue="false") boolean summary, @RequestParam(required=false) String title) {

        validateActor(actor);

        var profiles=db.queryForList("select username,name,bio,avatar,active from profile where actor=?",actor);

        if (profiles.isEmpty()) return Map.of("needsProfile",true);

        if(!Boolean.TRUE.equals(profiles.getFirst().get("active")) && db.queryForObject("select count(*) from email_account where actor=? and state='paused'",Integer.class,actor)>0)return Map.of("paused",true);
        checkActive(profiles.getFirst());

        if (title != null) validateTitle(title);
        return dashboard(profiles.getFirst(),actor,true,summary,title);

    }



    @PutMapping("/me/profile")

    Map<String,Object> profile(@RequestHeader("X-Actor") String actor,@RequestBody Profile input) {

        validateActor(actor);

        String username=ProfileFields.username(input.username());



        String name=required(input.name(),80), bio=optional(input.bio(),300);


        String avatar=ProfileFields.avatar(input.avatar());

        try {

            int count=db.update("update profile set username=?,name=?,bio=?,avatar=coalesce(?,avatar) where actor=? and active=true",username,name,bio,avatar,actor);

            if (count==0) {

                if (exists("select count(*) from profile where actor=?",actor)) fail(HttpStatus.FORBIDDEN,"Acesso suspenso.");



                db.update("insert into profile(actor,username,name,bio,avatar) values(?,?,?,?,?)",actor,username,name,bio,avatar);

            }

        } catch (DuplicateKeyException duplicate) { fail(HttpStatus.CONFLICT,"Nome de usuário já cadastrado."); }

        return me(actor,false,null);

    }



    @GetMapping("/profiles")
    Map<String,Object> profileByName(@RequestHeader("X-Actor") String actor,@RequestParam String username, @RequestParam(defaultValue="false") boolean summary) {
        return publicProfile(actor,username,summary);
    }

    @GetMapping("/profiles/{username}")

    Map<String,Object> publicProfile(@RequestHeader("X-Actor") String actor,@PathVariable String username, @RequestParam(defaultValue="false") boolean summary) {

        active(actor);

        var target=one("select actor,username,name,bio,avatar from profile where username=? and active=true",ProfileFields.username(username));

        return dashboard(target,(String)target.get("actor"),false,summary,null);

    }



    @GetMapping("/titles/{id}/reviews")

    List<Map<String,Object>> reviews(@RequestHeader("X-Actor") String actor,@PathVariable String id) {

        active(actor);

        validateTitle(id);
        return publicReviews(actor,id,episodic(id)||SEASON_ID.matcher(id).matches());
    }

    private static final String EFFECTIVE_SPOILER = """
        (l.spoiler or (select coalesce(sum(case when v.contains_spoiler then 1 else -1 end),0)
        from review_spoiler_vote v where v.author=l.actor and v.title=l.title) >= 2)
        """;
    private static final String MY_SPOILER_VOTE = """
        (select v.contains_spoiler from review_spoiler_vote v where v.author=l.actor and v.title=l.title and v.voter=?)
        """;

    private static final String FEED_SOURCE = " from library l join profile p on p.actor=l.actor "
        + "where l.review is not null and l.evaluation_public and not l.hidden and p.active ";

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
            + "l.review,l.version,"+EFFECTIVE_SPOILER+" as spoiler,"+MY_SPOILER_VOTE+" as my_vote "
            + "from library l join profile p on p.actor=l.actor where l.title=? and l.review is not null "
            + "and l.evaluation_public=true and l.hidden=false and p.active=true order by p.username limit 50",series,actor,id);
    }

    record SpoilerVote(String username, Integer version, Boolean containsSpoiler) {}
    @PutMapping("/titles/{id}/spoiler-vote") @Transactional
    Map<String,Object> voteSpoiler(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody SpoilerVote input) {
        lockActive(actor);
        validateTitle(id);
        if(input.containsSpoiler()==null || input.version()==null)fail(HttpStatus.BAD_REQUEST,"Informe o voto e a versão da resenha.");
        String author=(String)one("select actor from profile where username=? and active=true",ProfileFields.username(input.username())).get("actor");
        if(author.equals(actor))fail(HttpStatus.FORBIDDEN,"Você só pode votar em resenhas de outras pessoas.");
        var review=one("select version from library where actor=? and title=? and review is not null and evaluation_public and not hidden for update",author,id);
        if(!input.version().equals(review.get("version")))fail(HttpStatus.CONFLICT,"A resenha mudou. Atualize a página antes de votar.");
        if(db.update("update review_spoiler_vote set contains_spoiler=? where author=? and title=? and voter=?",input.containsSpoiler(),author,id,actor)==0)
            db.update("insert into review_spoiler_vote(author,title,voter,contains_spoiler) values(?,?,?,?)",author,id,actor,input.containsSpoiler());
        return one("select "+EFFECTIVE_SPOILER+" as spoiler,"+MY_SPOILER_VOTE+" as my_vote from library l where l.actor=? and l.title=?",actor,author,id);
    }

    private static final Set<String> REPORT_REASONS=Set.of("spoiler","harassment","hate","spam","inappropriate","off_topic","other");

    record ReviewReport(String username,Integer version,String reason,String details) {}

    @PostMapping("/titles/{id}/review-report") @Transactional
    Map<String,Boolean> reportReview(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody ReviewReport input) {
        active(actor);
        validateTitle(id);
        String details=optional(input.details(),500);
        if(input.version()==null||input.version()<0||input.reason()==null||!REPORT_REASONS.contains(input.reason())
            || ("other".equals(input.reason())&&details.isBlank()))
            fail(HttpStatus.BAD_REQUEST,"Escolha um motivo e descreva o problema ao selecionar Outro.");
        String author=(String)one("select actor from profile where username=? and active=true",ProfileFields.username(input.username())).get("actor");
        if(author.equals(actor))fail(HttpStatus.FORBIDDEN,"Você só pode reportar resenhas de outras pessoas.");
        db.queryForList("select actor from profile where actor in (?,?) order by actor for update",actor,author);
        active(actor);
        active(author);
        if(exists("select count(*) from review_report where reporter=? and author=? and title=? and review_version=?",actor,author,id,input.version()))
            return Map.of("reported",true);
        var review=one("select version,review from library where actor=? and title=? and review is not null and evaluation_public and not hidden for update",author,id);
        if(!input.version().equals(review.get("version")))
            fail(HttpStatus.CONFLICT,"A resenha mudou. Atualize a página antes de reportar.");
        if(db.queryForObject("select count(*) from review_report where reporter=? and created>?",Integer.class,actor,OffsetDateTime.now().minusDays(1))>=10)
            fail(HttpStatus.TOO_MANY_REQUESTS,"Limite de 10 denúncias por dia.");
        db.update("insert into review_report(id,reporter,author,title,review_version,review_text,reason,details) values(?,?,?,?,?,?,?,?)",
            UUID.randomUUID().toString(),actor,author,id,input.version(),review.get("review"),input.reason(),details);
        return Map.of("reported",true);
    }

    private boolean episodic(String id) {
        return id.startsWith("tmdb-tv-") || (id.startsWith("demo-") && "tv".equals(verifyTitle(id)));
    }

    @GetMapping("/titles/{id}/community")
    Map<String,Object> community(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        active(actor);
        validateTitle(id);
        var seasonKey=SEASON_ID.matcher(id);
        boolean season=seasonKey.matches();
        boolean series=episodic(id);
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
            result.put("average",roundedEpisodeAverage(sum,((Number)result.get("episode_rating_count")).longValue()));
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
                "season",item.getKey(),"average",roundedEpisodeAverage(item.getValue().getSum(),item.getValue().getCount()))).toList();
            var scores=bySeason.values().stream().mapToInt(stats->seasonHalfStars(stats.getSum(),stats.getCount())).summaryStatistics();
            result=new HashMap<>();
            result.put("rating_count",viewers.size());
            result.put("episode_rating_count",publicEpisodes.size());
            result.put("average",scores.getCount()==0?null:seriesHalfStars(scores)/2.0);
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

    @PutMapping("/me/library/{id}/{action}")

    @Transactional

    Map<String,Object> library(@RequestHeader("X-Actor") String actor,@PathVariable String id,@PathVariable String action,@RequestBody LibraryChange input) {

        lockActive(actor);

        if(SEASON_ID.matcher(id).matches()&&Set.of("watched","rating","rewatching").contains(action))
            fail(HttpStatus.BAD_REQUEST,"A nota e o progresso da temporada vêm dos episódios.");
        ensureLibrary(actor,id);

        var old=one("select * from library where actor=? and title=?",actor,id);

        switch(action) {

            case "watched" -> {

                if (input.value()==null) fail(HttpStatus.BAD_REQUEST,"Informe o estado.");

                if (input.value()) {
                    recordFirstViewing(actor,id,OffsetDateTime.now(DIARY_ZONE));
                    syncEpisodeSeason(actor,id);
                }

                else if (!input.value()) {

                    db.update("update library set watched=false,rewatching=false where actor=? and title=?",actor,id);
                    syncEpisodeSeason(actor,id);

                    if(db.update("delete from film_ranking where actor=? and title=?",actor,id)>0)

                        db.update("update profile set ranking_version=ranking_version+1 where actor=?",actor);

                }

            }

            case "interest" -> {

                if (input.value()==null) fail(HttpStatus.BAD_REQUEST,"Informe o estado.");

                if(input.value() && Boolean.TRUE.equals(old.get("watched")))
                    fail(HttpStatus.CONFLICT,"A obra já está marcada como assistida.");
                db.update("update library set interest=? where actor=? and title=?",input.value(),actor,id);

            }

            case "rewatching" -> {

                if(input.value()==null) fail(HttpStatus.BAD_REQUEST,"Informe o estado.");

                db.update("update library set rewatching=? where actor=? and title=?",input.value(),actor,id);

                if(input.value()) mark(actor,id);

            }

            case "rating" -> {
                if(episodic(id))fail(HttpStatus.BAD_REQUEST,"Avalie os episódios para calcular a nota da série.");

                Integer value=input.rating();

                if (value!=null && (value<1 || value>10)) fail(HttpStatus.BAD_REQUEST,"Nota fora da escala.");

                db.update("update library set rating=? where actor=? and title=?",value,actor,id);

                if (value!=null) mark(actor,id);
                var episodeKey=EPISODE_ID.matcher(id);
                if(episodeKey.matches())saveEpisodeRating(actor,episodeKey.group(1),
                    Integer.parseInt(episodeKey.group(2)),Integer.parseInt(episodeKey.group(3)),value);

            }

            case "visibility" -> {
                if(input.value()==null)fail(HttpStatus.BAD_REQUEST,"Informe a visibilidade da avaliação.");
                db.update("update library set evaluation_public=? where actor=? and title=?",input.value(),actor,id);
            }
            case "review" -> {

                String review=optional(input.review(),3000);

                if (input.version()==null || !input.version().equals(old.get("version"))) {
                    boolean alreadySaved=input.version()!=null && input.version()==((Integer)old.get("version"))-1
                        && Objects.equals(review.isBlank()?null:review,old.get("review"))
                        && Objects.equals(Boolean.TRUE.equals(input.spoiler()),old.get("spoiler"));
                    if(alreadySaved)break;
                    fail(HttpStatus.CONFLICT,"Resenha alterada. Atualize a página.");
                }

                db.update("update library set review_published_at=case when ? then null when review is null then CURRENT_TIMESTAMP else review_published_at end,review=?,spoiler=?,version=version+1 where actor=? and title=?",review.isBlank(),review.isBlank()?null:review,Boolean.TRUE.equals(input.spoiler()),actor,id);

                if (!Objects.equals(review.isBlank()?null:review,old.get("review")))
                    db.update("delete from review_spoiler_vote where author=? and title=?",actor,id);

                if (!review.isBlank() && old.get("review")==null) {

                    mark(actor,id);

                    if (!Boolean.TRUE.equals(old.get("rewatching")) &&

                            !exists("select count(*) from viewing where actor=? and title=?",actor,id)) {

                        OffsetDateTime watchedAt=OffsetDateTime.now(DIARY_ZONE);

                        insertViewing(actor,id,watchedAt.toLocalDate(),false,watchedAt);

                    }

                }

            }

            default -> fail(HttpStatus.NOT_FOUND,"Ação desconhecida.");

        }

        return one("select title,watched,interest,rewatching,rating,review,spoiler,hidden,version,evaluation_public from library where actor=? and title=?",actor,id);

    }



    @PostMapping("/me/viewings")

    @Transactional

    Map<String,String> createViewing(@RequestHeader("X-Actor") String actor,@RequestHeader("Idempotency-Key") String key,@RequestBody Viewing input) {

        lockActive(actor);

        LocalDate date=input.watchedAt()==null?input.date():input.watchedAt().atZoneSameInstant(DIARY_ZONE).toLocalDate();

        checkDate(date);

        String prior=receipt(actor,"viewing",key,input);

        if (prior!=null) return Map.of("id",prior);

        ensureLibrary(actor,input.title());

        var seasonKey=SEASON_ID.matcher(input.title());
        boolean canRewatch;
        if(seasonKey.matches()) {
            String series=seasonKey.group(1);
            int season=Integer.parseInt(seasonKey.group(2));
            canRewatch=seasonRewatched(actor,"ep-"+series+"-s"+season+"-e",seasonEpisodes(series,season));
        } else {
            canRewatch=exists("select count(*) from library where actor=? and title=? and rewatching=true",actor,input.title());
        }
        if(!input.rewatch()||!canRewatch)
            fail(HttpStatus.CONFLICT,seasonKey.matches()?"Registre duas sessões de cada episódio primeiro.":"Marque Vi novamente para registrar outra sessão.");

        String id=insertViewing(actor,input.title(),date,true,input.watchedAt());

        mark(actor,input.title());

        saveReceipt(actor,"viewing",key,input,id);

        return Map.of("id",id);

    }



    private String insertViewing(String actor,String title,LocalDate date,boolean rewatch,OffsetDateTime watchedAt) {

        String id=UUID.randomUUID().toString();

        db.update("insert into viewing(id,actor,title,watched_on,rewatch,watched_at) values(?,?,?,?,?,?)",

            id,actor,title,date,rewatch,watchedAt);

        return id;

    }



    @PutMapping("/me/viewings/{id}")

    @Transactional

    void editViewing(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody Viewing input) {

        lockActive(actor); checkDate(input.date());

        if (db.update("""

                update viewing set watched_at=case when watched_on=? then watched_at else null end,

                watched_on=?,rewatch=? where id=? and actor=?

                """,input.date(),input.date(),input.rewatch(),id,actor)==0)

            fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");

    }



    @DeleteMapping("/me/viewings/{id}")

    @Transactional

    void deleteViewing(@RequestHeader("X-Actor") String actor,@PathVariable String id) {

        lockActive(actor);

        if (db.update("delete from viewing where id=? and actor=?",id,actor)==0) fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");

    }



    record ProfileVisibility(String section,Boolean visible) {}
    @PutMapping("/me/visibility") @Transactional
    Map<String,Object> visibility(@RequestHeader("X-Actor") String actor,@RequestBody ProfileVisibility input){
        lockActive(actor);
        if(input.visible()==null||input.section()==null||!Set.of("all","watchlist","ranking","watched","diary").contains(input.section()))fail(HttpStatus.BAD_REQUEST,"Seção inválida.");
        if(input.section().equals("all"))db.update("update profile set show_watchlist=?,show_ranking=?,show_watched=?,show_diary=? where actor=?",input.visible(),input.visible(),input.visible(),input.visible(),actor);
        else db.update("update profile set show_"+input.section()+"=? where actor=?",input.visible(),actor);
        return profileVisibility(actor);
    }
    private Map<String,Object> profileVisibility(String actor){
        var row=one("select show_watchlist,show_ranking,show_watched,show_diary from profile where actor=?",actor);
        var result=new LinkedHashMap<String,Object>();
        for(String section:List.of("watchlist","ranking","watched","diary"))result.put(section,row.get("show_"+section));
        return result;
    }
    private static final int DIARY_PAGE_SIZE = 24;

    record DiaryPage(List<Map<String,Object>> items, boolean hasMore) {}

    private DiaryPage diaryPage(String actor, int page, String title) {
        var args = new ArrayList<Object>();
        args.add(actor);
        if (title != null) args.add(title);
        args.add(DIARY_PAGE_SIZE + 1);
        args.add((page - 1L) * DIARY_PAGE_SIZE);
        var rows = db.queryForList("select id,title,watched_on,rewatch,watched_at from viewing where actor=? "
                + (title == null ? "" : "and title=? ")
                + "order by watched_on desc nulls last, coalesce(watched_at,created) desc, id desc limit ? offset ?", args.toArray());
        return new DiaryPage(rows.subList(0, Math.min(rows.size(), DIARY_PAGE_SIZE)), rows.size() > DIARY_PAGE_SIZE);
    }

    @GetMapping("/diary")
    DiaryPage diary(@RequestHeader("X-Actor") String actor, @RequestParam int page,
                    @RequestParam(required=false) String username, @RequestParam(required=false) String title) {
        active(actor);
        if (page < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (title != null) validateTitle(title);
        if (username == null) return diaryPage(actor, page, title);
        var target = one("select actor from profile where username=? and active=true", ProfileFields.username(username));
        String owner = (String)target.get("actor");
        if (!Boolean.TRUE.equals(profileVisibility(owner).get("diary")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return diaryPage(owner, page, title);
    }

    @GetMapping("/notifications")
    Map<String,Object> notifications(@RequestHeader("X-Actor") String actor) {
        active(actor);
        var items=db.queryForList("""
                select kind,target,label,sender,count(*) over() as total from (
                    select 'friend' as kind,p.username as target,p.name as label,p.name as sender,f.created
                    from friendship f join profile p on p.actor=f.requester
                    where f.recipient=? and f.status='pending' and p.active=true
                    union all
                    select 'room',r.id,r.name,p.name,i.created
                    from movie_room_invitation i join movie_room r on r.id=i.room
                    join profile p on p.actor=i.sender
                    where i.recipient=? and p.active=true and r.status='lobby' and r.expires>CURRENT_TIMESTAMP
                    and not exists(select 1 from movie_room_member m where m.room=r.id and m.actor=i.recipient)
                    union all
                    select reason,room,name,'',visible_at from room_end_notice
                    where recipient=? and seen=false and visible_at<=CURRENT_TIMESTAMP
                ) notices order by created desc,kind,target limit 20
                """,actor,actor,actor);
        long total=items.isEmpty()?0:((Number)items.getFirst().get("total")).longValue();
        items.forEach(row->row.remove("total"));
        return Map.of("items",items,"total",total);
    }

    @PutMapping("/notifications/rooms/{id}/read")
    Map<String,Boolean> readRoomNotice(@RequestHeader("X-Actor") String actor,@PathVariable String id){
        active(actor);
        db.update("update room_end_notice set seen=true where room=? and recipient=? and visible_at<=CURRENT_TIMESTAMP",id,actor);
        return Map.of("read",true);
    }

    @GetMapping("/library-page")
    Map<String,Object> libraryPage(@RequestHeader("X-Actor") String actor, @RequestParam String section,
                                   @RequestParam int page, @RequestParam(required=false) String username) {
        active(actor);
        if (page < 1 || !Set.of("watched","watchlist").contains(section))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String owner = actor;
        boolean visitor = username != null;
        if (visitor) {
            owner = (String)one("select actor from profile where username=? and active=true", ProfileFields.username(username)).get("actor");
            if (!Boolean.TRUE.equals(profileVisibility(owner).get(section)))
                throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        boolean watchlist = section.equals("watchlist");
        String predicate = watchlist ? "interest=true" : visitor
                ? "(watched=true or (evaluation_public=true and hidden=false and (rating is not null or review is not null)))"
                : "(watched=true or rating is not null or review is not null)";
        String fields = watchlist ? "title" : visitor
                ? "title,rewatching,case when evaluation_public and not hidden then rating end as rating,"
                    + "case when evaluation_public and not hidden then review end as review,"
                    + "case when evaluation_public and not hidden then "+EFFECTIVE_SPOILER+" else false end as spoiler,version,"
                    + MY_SPOILER_VOTE+" as my_vote,exists(select 1 from library viewer where viewer.actor=? and viewer.title=l.title and viewer.watched) as viewer_watched"
                : "title,rewatching,rating,review,spoiler";
        int size = 24;
        Object[] args = visitor && !watchlist ? new Object[]{actor,actor,owner,size,(page-1L)*size} : new Object[]{owner,size,(page-1L)*size};
        var rows = db.queryForList("select " + fields + ",count(*) over() as total from library l where actor=? and "
                + predicate + " order by title limit ? offset ?",args);
        long total = rows.isEmpty() ? 0 : ((Number)rows.getFirst().get("total")).longValue();
        rows.forEach(row -> row.remove("total"));
        return Map.of("items",rows,"pages",(total + size - 1)/size);
    }

    private Map<String,Object> dashboard(Map<String,Object> profile,String actor,boolean own,boolean summary,String title) {
        var visibility=profileVisibility(actor);
        var diary = own || Boolean.TRUE.equals(visibility.get("diary"))
                ? diaryPage(actor, 1, null) : new DiaryPage(List.of(), false);
        List<Map<String,Object>> library;
        if(summary)library=List.of();
        else if(own && title!=null)library=db.queryForList("select title,watched,interest,rewatching,rating,review,spoiler,hidden,version,evaluation_public from library where actor=? and title=?",actor,title);
        else if(own)library=db.queryForList("select title,watched,interest,rewatching,rating,review,spoiler,hidden,version,evaluation_public from library where actor=? order by title limit 1000",actor);
        else {
            boolean watched=Boolean.TRUE.equals(visibility.get("watched")),watchlist=Boolean.TRUE.equals(visibility.get("watchlist"));
            library=db.queryForList("select title,watched,interest,rewatching,rating,review,"+EFFECTIVE_SPOILER+" as spoiler,hidden,evaluation_public from library l where actor=? and ((? and watched=true) or (? and interest=true) or (? and evaluation_public=true and hidden=false and (rating is not null or review is not null))) order by title limit 1000",actor,watched,watchlist,watched);
            for(var item:library){
                if(!watched){item.put("watched",false);item.put("rewatching",false);}
                if(!watchlist)item.put("interest",false);
                if(!watched||!Boolean.TRUE.equals(item.get("evaluation_public"))||Boolean.TRUE.equals(item.get("hidden"))){item.put("rating",null);item.put("review",null);item.put("spoiler",false);}
                item.remove("hidden");item.remove("evaluation_public");
            }
        }
        var ranking=new ArrayList<Map<String,Object>>();
        if(own||Boolean.TRUE.equals(visibility.get("ranking"))) {
            ranking.addAll(manualRanking(actor));
            ranking.addAll(seriesRanking(actor,!own));
        }
        return Map.of("profile",Map.of("username",profile.get("username"),"name",profile.get("name"),"bio",profile.get("bio"),"avatar",Objects.toString(profile.get("avatar"),"")),"library",library,"viewings",diary.items(),"diaryHasMore",diary.hasMore(),"ranking",ranking,"visibility",visibility);
    }

    private void ensureLibrary(String actor,String id) {

        validateTitle(id);

        if (!exists("select count(*) from library where actor=? and title=?",actor,id)) {

            verifyTitle(id);

            db.update("insert into library(actor,title,evaluation_public,spoiler) values(?,?,true,false)",actor,id);

        }

    }



    private void createLibraryEntry(String actor,String id,String seriesId) {
        boolean visible=seriesId==null || !exists(
            "select count(*) from library where actor=? and title=? and (not evaluation_public or hidden)",actor,seriesId);
        db.update("insert into library(actor,title,evaluation_public,spoiler) values(?,?,?,false)",actor,id,visible);
    }

    private String verifyTitle(String id) {

        validateTitle(id);

        try {

            var response=http.send(HttpRequest.newBuilder(URI.create(catalog+"/titles/"+id)).timeout(Duration.ofSeconds(3))

                .header("X-Internal-Key",catalogKey).GET().build(),HttpResponse.BodyHandlers.ofString());

            int status=response.statusCode();

            if (status==404) fail(HttpStatus.NOT_FOUND,"Obra não encontrada.");

            if (status!=200) fail(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo indisponível.");

            return mapper.readTree(response.body()).path("format").asText();

        } catch (InterruptedException interrupted) {

            Thread.currentThread().interrupt(); fail(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida.");

        } catch (java.io.IOException failure) { fail(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo indisponível."); }

        throw new IllegalStateException("Catálogo indisponível.");

    }



    private void mark(String actor,String id) {
        if(SEASON_ID.matcher(id).matches())return;
        db.update("update library set watched=true,interest=false where actor=? and title=?",actor,id);
        syncEpisodeSeason(actor,id);
    }

    private void recordFirstViewing(String actor,String id,OffsetDateTime now) {
        db.update("update library set watched=true,interest=false where actor=? and title=?",actor,id);
        if(!exists("select count(*) from viewing where actor=? and title=?",actor,id))
            insertViewing(actor,id,now.toLocalDate(),false,now);
    }

    private void syncEpisodeSeason(String actor,String id) {
        var key=EPISODE_ID.matcher(id);
        if(key.matches())syncSeasonWatched(actor,key.group(1),Integer.parseInt(key.group(2)));
    }

    private void syncSeasonWatched(String actor,String series,int season) {
        String id="season-"+series+"-s"+season;
        boolean watched=exists("select count(*) from library where actor=? and watched=true and title like ?",
            actor,"ep-"+series+"-s"+season+"-e%");
        if(watched) {
            if(!exists("select count(*) from library where actor=? and title=?",actor,id))createLibraryEntry(actor,id,series);
            db.update("update library set watched=true,interest=false where actor=? and title=?",actor,id);
        } else {
            db.update("update library set watched=false,rewatching=false where actor=? and title=?",actor,id);
        }
    }

    private void active(String actor) { validateActor(actor); checkActive(one("select active from profile where actor=?",actor)); }

    private void lockActive(String actor) { validateActor(actor); checkActive(one("select active from profile where actor=? for update",actor)); }

    private static void checkActive(Map<String,Object> row) { if(!Boolean.TRUE.equals(row.get("active"))) fail(HttpStatus.FORBIDDEN,"Acesso suspenso."); }



    private String receipt(String actor,String action,String key,Object body) {

        if (key==null || !key.matches("[A-Za-z0-9_-]{8,80}")) fail(HttpStatus.BAD_REQUEST,"Chave de repetição inválida.");

        db.update("delete from request_receipt where actor=? and created<?",actor,OffsetDateTime.now(ZoneOffset.UTC).minusHours(24));

        var rows=db.queryForList("select body_hash,resource_id from request_receipt where actor=? and action=? and request_key=?",actor,action,key);

        if(rows.isEmpty()) return null;

        if(!hash(body).equals(rows.getFirst().get("body_hash"))) fail(HttpStatus.CONFLICT,"Chave já usada com outros dados.");

        return (String)rows.getFirst().get("resource_id");

    }

    private void saveReceipt(String actor,String action,String key,Object body,String id) {

        db.update("insert into request_receipt(actor,action,request_key,body_hash,resource_id) values(?,?,?,?,?)",actor,action,key,hash(body),id);

    }

    private String hash(Object body) {

        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(body))); }

        catch (java.security.NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException failure) { throw new IllegalStateException(failure); }

    }



    private boolean exists(String sql,Object... args) { return db.queryForObject(sql,Integer.class,args)>0; }

    private Map<String,Object> one(String sql,Object... args) {

        var rows=db.queryForList(sql,args);

        if(rows.isEmpty()) fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");

        return rows.getFirst();

    }

    private static void validateActor(String actor) { if(actor==null || !actor.matches("[A-Za-z0-9_-]{8,160}")) fail(HttpStatus.UNAUTHORIZED,"Sessão inválida."); }

    private static final java.util.regex.Pattern EPISODE_ID=java.util.regex.Pattern.compile("ep-((?:demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12}))-s(0|[1-9][0-9]{0,2}|1000)-e([1-9][0-9]{0,8})");
    private static final java.util.regex.Pattern SEASON_ID=java.util.regex.Pattern.compile("season-(demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12})-s(0|[1-9][0-9]{0,2}|1000)");
    private static void validateTitle(String id) { if(id==null || (!id.matches("demo-[a-z0-9-]{1,60}|tmdb-(movie|tv)-[1-9][0-9]{0,12}") && !EPISODE_ID.matcher(id).matches() && !SEASON_ID.matcher(id).matches())) fail(HttpStatus.BAD_REQUEST,"Identificador inválido."); }

    private static void checkDate(LocalDate date) { if(date!=null && date.isAfter(LocalDate.now(DIARY_ZONE))) fail(HttpStatus.BAD_REQUEST,"A data não pode estar no futuro."); }

    private static String required(String value,int limit) { String result=optional(value,limit); if(result.isBlank()) fail(HttpStatus.BAD_REQUEST,"Campo obrigatório."); return result; }

    private static String optional(String value,int limit) { String result=value==null?"":value.strip(); if(result.length()>limit) fail(HttpStatus.BAD_REQUEST,"Texto acima do limite de "+limit+" caracteres."); return result; }

    private static void fail(HttpStatus status,String message) { throw new ResponseStatusException(status,message); }

}
