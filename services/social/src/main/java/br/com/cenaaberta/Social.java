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

    private final CatalogTitles catalog;






    public static void main(String[] args) { SpringApplication.run(Social.class,args); }



    Social(JdbcTemplate db,

           ActiveActors actors,LibraryEntries entries,CatalogTitles catalog) {

        this.db=db; this.actors=actors; this.entries=entries; this.catalog=catalog;

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
        return publicReviews(actor,id,entries.episodic(id));
    }

    static final String EFFECTIVE_SPOILER = """
        (l.spoiler or (select coalesce(sum(case when v.contains_spoiler then 1 else -1 end),0)
        from review_spoiler_vote v where v.author=l.actor and v.title=l.title) >= 2)
        """;
    private static final String MY_SPOILER_VOTE = """
        (select v.contains_spoiler from review_spoiler_vote v where v.author=l.actor and v.title=l.title and v.voter=?)
        """;

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


    @GetMapping("/titles/{id}/community")
    Map<String,Object> community(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.requireActive(actor);
        validateTitle(id);
        boolean series=entries.episodic(id);
        Map<String,Object> result;
        if(series) {
            var publicEpisodes=db.queryForList("""
                select e.actor,e.season,e.rating from episode_rating e
                join library l on l.actor=e.actor and l.title=e.title
                join profile p on p.actor=e.actor
                where e.title=? and l.evaluation_public=true and l.hidden=false and p.active=true
                """,id);
            var bySeason=new TreeMap<Integer,IntSummaryStatistics>();
            var viewers=new HashSet<>();
            for(var episode:publicEpisodes) {
                viewers.add(episode.get("actor"));
                bySeason.computeIfAbsent((Integer)episode.get("season"),key->new IntSummaryStatistics())
                    .accept((Integer)episode.get("rating"));
            }
            var seasons=bySeason.entrySet().stream().map(season->Map.<String,Object>of(
                "season",season.getKey(),"average",season.getValue().getAverage()/2)).toList();
            var average=bySeason.values().stream().mapToDouble(stats->stats.getAverage()/2).average();
            result=new HashMap<>();
            result.put("rating_count",viewers.size());
            result.put("episode_rating_count",publicEpisodes.size());
            result.put("average",average.isPresent()?average.getAsDouble():null);
            result.put("seasons",seasons);
        } else {
            result=new HashMap<>(db.queryForMap("""
                select count(l.rating) as rating_count, avg(cast(l.rating as decimal(8,4)))/2 as average
                from library l join profile p on p.actor=l.actor
                where l.title=? and l.evaluation_public=true and l.hidden=false and p.active=true
                """,id));
        }
        result.put("reviews",publicReviews(actor,id,series));
        return result;
    }

    record ProfileVisibility(String section,Boolean visible) {}
    @PutMapping("/me/visibility") @Transactional
    Map<String,Object> visibility(@RequestHeader("X-Actor") String actor,@RequestBody ProfileVisibility input){
        actors.lockActive(actor);
        if(input.visible()==null||input.section()==null||!Set.of("all","watchlist","ranking","watched","diary","lists").contains(input.section()))fail(HttpStatus.BAD_REQUEST,"Seção inválida.");
        if(input.section().equals("all"))db.update("update profile set show_watchlist=?,show_ranking=?,show_watched=?,show_diary=?,show_lists=? where actor=?",input.visible(),input.visible(),input.visible(),input.visible(),input.visible(),actor);
        else db.update("update profile set show_"+input.section()+"=? where actor=?",input.visible(),actor);
        return profileVisibility(actor);
    }
    private Map<String,Object> profileVisibility(String actor){
        var row=Rows.one(db,"select show_watchlist,show_ranking,show_watched,show_diary,show_lists from profile where actor=?",actor);
        var result=new LinkedHashMap<String,Object>();
        for(String section:List.of("watchlist","ranking","watched","diary","lists"))result.put(section,row.get("show_"+section));
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

    static final Set<String> LIBRARY_SORTS=Set.of("title","recent","rating","name","year");
    static final Set<String> CATALOG_FILTERS=Set.of("movie","tv","anime");
    /** Teto de linhas lidas quando o filtro/ordem depende do catálogo (mesmo teto de 1000 do painel, com folga). */
    static final int CATALOG_SCAN=2000;

    /**
     * Página da biblioteca (assistidos ou Vou ver), própria ou de outra pessoa.
     * @param actor usuário da sessão
     * @param section watched | watchlist
     * @param page página (1..), 24 itens
     * @param username dono da biblioteca; ausente = o próprio usuário
     * @param sort title (padrão, ordem antiga por id) | recent | rating | name | year
     * @param filter all (padrão) | unrated | rated | min:N (1..10) | movie | tv | anime
     * @return {items,pages}
     */
    @GetMapping("/library-page")
    Map<String,Object> libraryPage(@RequestHeader("X-Actor") String actor, @RequestParam String section,
                                   @RequestParam int page, @RequestParam(required=false) String username,
                                   @RequestParam(defaultValue="title") String sort, @RequestParam(defaultValue="all") String filter) {
        actors.requireActive(actor);
        if (page < 1 || !Set.of("watched","watchlist").contains(section))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (!LIBRARY_SORTS.contains(sort) || !(Set.of("all","unrated","rated").contains(filter) || CATALOG_FILTERS.contains(filter) || filter.matches("min:(10|[1-9])")))
            fail(HttpStatus.BAD_REQUEST,"Filtro ou ordenação inválidos.");
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
        // Visitante só filtra/ordena pela nota que consegue ver; senão a ordem vazaria notas privadas.
        String rating = visitor ? "case when l.evaluation_public and not l.hidden then l.rating end" : "l.rating";
        if (filter.equals("unrated")) predicate += " and " + rating + " is null";
        else if (filter.equals("rated")) predicate += " and " + rating + " is not null";
        else if (filter.startsWith("min:")) predicate += " and " + rating + " >= " + Integer.parseInt(filter.substring(4));
        // "recent" usa a última sessão do diário; para visitante só quando o diário é público (a ordem revelaria datas).
        // O Vou ver não tem data própria, então lá "recent" cai na ordem padrão.
        boolean recent = sort.equals("recent") && !watchlist && (!visitor || Boolean.TRUE.equals(profileVisibility(owner).get("diary")));
        String order = sort.equals("rating") ? rating + " desc nulls last,l.title"
                : recent ? "(select max(coalesce(v.watched_at,v.created)) from viewing v where v.actor=l.actor and v.title=l.title) desc nulls last,l.title"
                : "l.title";
        int size = 24;
        boolean catalogMode = sort.equals("name") || sort.equals("year") || CATALOG_FILTERS.contains(filter);
        var args = new ArrayList<Object>();
        if (visitor && !watchlist) { args.add(actor); args.add(actor); }
        args.add(owner);
        if (catalogMode) args.add(CATALOG_SCAN);
        else { args.add(size); args.add((page-1L)*size); }
        var rows = db.queryForList("select " + fields + ",count(*) over() as total from library l where actor=? and "
                + predicate + " order by " + order + " limit ?" + (catalogMode ? "" : " offset ?"),args.toArray());
        long total = rows.isEmpty() ? 0 : ((Number)rows.getFirst().get("total")).longValue();
        rows.forEach(row -> row.remove("total"));
        if (catalogMode) {
            rows = catalogPage(rows,sort,filter);
            total = rows.size();
            rows = rows.subList((int)Math.min(rows.size(),(page-1L)*size),(int)Math.min(rows.size(),(long)page*size));
        }
        return Map.of("items",rows,"pages",(total + size - 1)/size);
    }

    /** Filtra por formato e/ou ordena por nome/ano com metadados do catálogo; a ordem SQL anterior desempata (sort estável). */
    private List<Map<String,Object>> catalogPage(List<Map<String,Object>> rows,String sort,String filter) {
        var meta = rows.isEmpty() ? Map.<String,com.fasterxml.jackson.databind.JsonNode>of()
                : catalog.titles(rows.stream().map(row -> (String)row.get("title")).toList(),false);
        var result = new ArrayList<Map<String,Object>>();
        for (var row : rows) {
            var title = meta.get((String)row.get("title"));
            if (CATALOG_FILTERS.contains(filter)) {
                if (title == null) continue;
                String format = title.path("anime").asBoolean() ? "anime" : title.path("format").asText();
                if (!format.equals(filter)) continue;
            }
            result.add(row);
        }
        if (sort.equals("name")) {
            var collator = java.text.Collator.getInstance(Locale.forLanguageTag("pt-BR"));
            result.sort(Comparator.comparing((Map<String,Object> row) -> {
                var title = meta.get((String)row.get("title"));
                return title == null ? null : title.path("name").asText();
            }, Comparator.nullsLast(collator::compare)));
        } else if (sort.equals("year")) {
            result.sort(Comparator.comparing((Map<String,Object> row) -> {
                var title = meta.get((String)row.get("title"));
                return title == null || !title.path("year").asText().matches("\\d{4}") ? null : Integer.valueOf(title.path("year").asText());
            }, Comparator.nullsLast(Comparator.<Integer>reverseOrder())));
        }
        return result;
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
        var ranking=own||Boolean.TRUE.equals(visibility.get("ranking"))?db.queryForList("select title,tier from film_ranking where actor=? order by tier,position",actor):List.of();
        return Map.of("profile",Map.of("username",profile.get("username"),"name",profile.get("name"),"bio",profile.get("bio"),"avatar",Objects.toString(profile.get("avatar"),"")),"library",library,"viewings",diary.items(),"diaryHasMore",diary.hasMore(),"ranking",ranking,"visibility",visibility);
    }

}
