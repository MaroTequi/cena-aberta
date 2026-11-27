package br.com.cenaaberta;






import java.time.*;

import java.util.*;





import org.springframework.boot.*;

import org.springframework.boot.autoconfigure.SpringBootApplication;

import org.springframework.dao.DuplicateKeyException;

import org.springframework.http.HttpStatus;

import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.transaction.annotation.Transactional;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;


import static br.com.cenaaberta.Guards.*;



@SpringBootApplication

@RestController

public class Social {

    public record Profile(String username,String name,String bio,String avatar) {}


    private final JdbcTemplate db;


    private final ActiveActors actors;

    private final LibraryEntries entries;
    private final Ranking rankings;






    public static void main(String[] args) { SpringApplication.run(Social.class,args); }



    Social(JdbcTemplate db,

           ActiveActors actors,LibraryEntries entries,Ranking rankings) {
        this.rankings=rankings;

        this.db=db; this.actors=actors; this.entries=entries;

    }



    @GetMapping("/health") Map<String,String> health() { db.queryForObject("select 1",Integer.class); return Map.of("status","ok"); }



    @GetMapping("/me") Map<String,Object> me(@RequestHeader("X-Actor") String actor, @RequestParam(defaultValue="false") boolean summary, @RequestParam(required=false) String title) {

        validateActor(actor);

        var profiles=db.queryForList("select username,name,bio,avatar,active from profile where actor=?",actor);

        if (profiles.isEmpty()) return Map.of("needsProfile",true);

        if(!Boolean.TRUE.equals(profiles.getFirst().get("active")) && db.queryForObject("select count(*) from email_account where actor=? and state='paused'",Integer.class,actor)>0)return Map.of("paused",true);
        ActiveActors.checkActive(profiles.getFirst());

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

                if (Rows.exists(db,"select count(*) from profile where actor=?",actor)) fail(HttpStatus.FORBIDDEN,"Acesso suspenso.");



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

        actors.requireActive(actor);

        var target=Rows.one(db,"select actor,username,name,bio,avatar from profile where username=? and active=true",ProfileFields.username(username));

        return dashboard(target,(String)target.get("actor"),false,summary,null);

    }



    @GetMapping("/titles/{id}/reviews")

    List<Map<String,Object>> reviews(@RequestHeader("X-Actor") String actor,@PathVariable String id) {

        actors.requireActive(actor);

        validateTitle(id);
        return publicReviews(actor,id,entries.episodic(id)||SEASON_ID.matcher(id).matches());
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

    private static final Set<String> REPORT_REASONS=Set.of("spoiler","harassment","hate","spam","inappropriate","off_topic","other");

    record ReviewReport(String username,Integer version,String reason,String details) {}

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

    record ProfileVisibility(String section,Boolean visible) {}
    @PutMapping("/me/visibility") @Transactional
    Map<String,Object> visibility(@RequestHeader("X-Actor") String actor,@RequestBody ProfileVisibility input){
        actors.lockActive(actor);
        if(input.visible()==null||input.section()==null||!Set.of("all","watchlist","ranking","watched","diary").contains(input.section()))fail(HttpStatus.BAD_REQUEST,"Seção inválida.");
        if(input.section().equals("all"))db.update("update profile set show_watchlist=?,show_ranking=?,show_watched=?,show_diary=? where actor=?",input.visible(),input.visible(),input.visible(),input.visible(),actor);
        else db.update("update profile set show_"+input.section()+"=? where actor=?",input.visible(),actor);
        return profileVisibility(actor);
    }
    private Map<String,Object> profileVisibility(String actor){
        var row=Rows.one(db,"select show_watchlist,show_ranking,show_watched,show_diary from profile where actor=?",actor);
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
        actors.requireActive(actor);
        if (page < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (title != null) validateTitle(title);
        if (username == null) return diaryPage(actor, page, title);
        var target = Rows.one(db,"select actor from profile where username=? and active=true", ProfileFields.username(username));
        String owner = (String)target.get("actor");
        if (!Boolean.TRUE.equals(profileVisibility(owner).get("diary")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return diaryPage(owner, page, title);
    }

    @GetMapping("/notifications")
    Map<String,Object> notifications(@RequestHeader("X-Actor") String actor) {
        actors.requireActive(actor);
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
        actors.requireActive(actor);
        db.update("update room_end_notice set seen=true where room=? and recipient=? and visible_at<=CURRENT_TIMESTAMP",id,actor);
        return Map.of("read",true);
    }

    @GetMapping("/library-page")
    Map<String,Object> libraryPage(@RequestHeader("X-Actor") String actor, @RequestParam String section,
                                   @RequestParam int page, @RequestParam(required=false) String username) {
        actors.requireActive(actor);
        if (page < 1 || !Set.of("watched","watchlist").contains(section))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String owner = actor;
        boolean visitor = username != null;
        if (visitor) {
            owner = (String)Rows.one(db,"select actor from profile where username=? and active=true", ProfileFields.username(username)).get("actor");
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
            ranking.addAll(rankings.manualRanking(actor));
            ranking.addAll(rankings.seriesRanking(actor,!own));
        }
        return Map.of("profile",Map.of("username",profile.get("username"),"name",profile.get("name"),"bio",profile.get("bio"),"avatar",Objects.toString(profile.get("avatar"),"")),"library",library,"viewings",diary.items(),"diaryHasMore",diary.hasMore(),"ranking",ranking,"visibility",visibility);
    }

}
