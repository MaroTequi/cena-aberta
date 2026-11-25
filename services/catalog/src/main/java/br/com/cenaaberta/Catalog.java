package br.com.cenaaberta;



import java.net.URI;

import java.net.URLEncoder;

import java.net.http.*;

import java.nio.charset.StandardCharsets;

import java.security.MessageDigest;

import java.time.Duration;

import java.text.Normalizer;

import java.util.*;

import com.fasterxml.jackson.databind.*;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Value;

import org.springframework.boot.*;

import org.springframework.boot.autoconfigure.SpringBootApplication;

import org.springframework.http.HttpStatus;

import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.web.bind.annotation.*;

import org.springframework.web.server.ResponseStatusException;



@SpringBootApplication

@RestController

public class Catalog {

    public record Title(String id, String format, boolean anime, String name, String original,

                        String year, String summary, String poster, Details details) {

        Title(String id, String format, boolean anime, String name, String original,

              String year, String summary, String poster) {

            this(id,format,anime,name,original,year,summary,poster,null);

        }

        Title withDetails(Details details) {

            return new Title(id,format,anime,name,original,year,summary,poster,details);

        }

    }

    public record Details(List<String> genres, Integer runtime, Integer seasons, Integer episodes,

                          List<String> directors, List<String> creators, List<String> cast,
                          List<PersonCredit> people) {
        Details(List<String> genres,Integer runtime,Integer seasons,Integer episodes,List<String> directors,List<String> creators,List<String> cast){
            this(genres,runtime,seasons,episodes,directors,creators,cast,List.of());
        }
    }

    public record PersonCredit(long id,String name,String photo,List<String> roles,boolean castMember) {}
    public record WorkCredit(String id,String title,String date,String poster,List<String> roles) {}
    public record Person(long id,String name,String photo,String biography,String birthday,String deathday,String birthplace,List<WorkCredit> works) {}

    private static String posterUrl(JsonNode item,String size){
        return imageUrl(item,"poster_path",size);
    }

    private static String imageUrl(JsonNode item,String field,String size){
        String path=item.path(field).asText("");
        return path.matches("/[A-Za-z0-9._-]+")?"https://image.tmdb.org/t/p/"+size+path:null;
    }

    private static String portrait(JsonNode item){
        String path=item.path("profile_path").asText("");
        return path.matches("/[A-Za-z0-9._-]+")?"https://image.tmdb.org/t/p/w185"+path:null;
    }

    private static String text(JsonNode item,String field){ return item.path(field).asText(""); }

    private static void addPerson(Map<Long,PersonCredit> group,JsonNode item,List<String> roles,boolean acting){
        long id=item.path("id").asLong();
        if(id<=0||text(item,"name").isBlank()||roles.isEmpty())return;
        var person=group.computeIfAbsent(id,key->new PersonCredit(id,text(item,"name"),portrait(item),new ArrayList<>(),acting));
        for(String role:roles)if(!role.isBlank()&&!person.roles().contains(role))person.roles().add(role);
    }

    private static List<String> roles(JsonNode item,boolean acting){
        String field=acting?"character":"job";
        var result=new LinkedHashSet<String>();
        for(var entry:item.path(acting?"roles":"jobs")){
            if(!text(entry,field).isBlank())result.add(text(entry,field));
        }
        if(!text(item,field).isBlank())result.add(text(item,field));
        if(acting&&result.isEmpty())result.add("Acting");
        return List.copyOf(result);
    }

    static List<PersonCredit> people(JsonNode item){
        var cast=new LinkedHashMap<Long,PersonCredit>();
        var crew=new LinkedHashMap<Long,PersonCredit>();
        var credits=item.path("aggregate_credits").isObject()?item.path("aggregate_credits"):item.path("credits");
        for(var row:credits.path("cast"))addPerson(cast,row,roles(row,true),true);
        for(var row:item.path("created_by"))addPerson(crew,row,List.of("Creator"),false);
        for(var row:credits.path("crew"))addPerson(crew,row,roles(row,false),false);
        var result=new ArrayList<>(cast.values());
        result.addAll(crew.values());
        return result;
    }

    @GetMapping("/people/{id:[1-9][0-9]*}")
    Person person(@PathVariable long id){
        if(token.isBlank())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        var data=remote("/person/"+id+"?append_to_response=combined_credits");
        return new Person(id,text(data,"name"),portrait(data),text(data,"biography"),text(data,"birthday"),
            text(data,"deathday"),text(data,"place_of_birth"),filmography(data.path("combined_credits")));
    }

    static List<WorkCredit> filmography(JsonNode credits){
        var works=new LinkedHashMap<String,WorkCredit>();
        for(String group:List.of("cast","crew"))for(var row:credits.path(group)){
            String type=text(row,"media_type");
            long id=row.path("id").asLong();
            if(id<=0||row.path("adult").asBoolean()||!(type.equals("movie")||type.equals("tv")))continue;
            boolean movie=type.equals("movie");
            String title=text(row,movie?"title":"name");
            if(title.isBlank())continue;
            String key="tmdb-"+type+"-"+id;
            var work=works.computeIfAbsent(key,k->new WorkCredit(k,title,text(row,movie?"release_date":"first_air_date"),posterUrl(row,"w185"),new ArrayList<>()));
            for(String role:roles(row,group.equals("cast")))if(!work.roles().contains(role))work.roles().add(role);
        }
        return works.values().stream().sorted(Comparator.comparing(WorkCredit::date).reversed().thenComparing(WorkCredit::title)).toList();
    }

    private final JdbcTemplate db;

    private final ObjectMapper mapper;

    private final String secret, token;

    private final String apiBase;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    private final List<Title> fixtures = List.of(

        new Title("demo-ultimo-rolo","movie",false,"O Último Rolo","O Último Rolo","2024","Uma projecionista procura o último filme de uma sala prestes a fechar.",null),

        new Title("demo-mare-alta","tv",false,"Maré Alta","Maré Alta","2025","O retorno de uma fotógrafa põe em movimento os segredos de uma cidade litorânea.",null),

        new Title("demo-lua-de-papel","movie",true,"Lua de Papel","Kami no Tsuki","2023","Uma aprendiz de cartógrafa desenha um caminho para casa num céu em constante mudança.",null),

        new Title("demo-neon-norte","tv",true,"Neon Norte","Neon North","2025","Mensageiros cruzam de bicicleta uma cidade que só desperta depois da meia-noite.",null),

        new Title("demo-fim-da-linha","movie",false,"Fim da Linha","Fim da Linha","2022","Duas pessoas dividem o último ônibus e um plano para recomeçar.",null),

        new Title("demo-arquipelago","tv",false,"Arquipélago","Arquipélago","2024","Uma equipe de rádio documenta a vida em ilhas separadas pela névoa.",null)

    );



    public static void main(String[] args) { SpringApplication.run(Catalog.class, args); }



    Catalog(JdbcTemplate db, ObjectMapper mapper, @Value("${internal.secret}") String secret,

            @Value("${TMDB_TOKEN:}") String token,

            @Value("${tmdb.api-base:https://api.themoviedb.org/3}") String apiBase) {

        this.db = db; this.mapper = mapper; this.secret = secret; this.token = token.trim(); this.apiBase = apiBase;

        if (secret.length() < 24) throw new IllegalArgumentException("INTERNAL_SECRET precisa de pelo menos 24 caracteres");

    }



    @ModelAttribute

    void verify(HttpServletRequest request) {

        if (request.getRequestURI().equals("/health")) return;

        String actual = request.getHeader("X-Internal-Key");

        if (actual == null || !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8)))

            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);

    }



    @GetMapping("/health") Map<String,String> health() { db.queryForObject("select 1", Integer.class); return Map.of("status","ok"); }



    private static final Map<Integer,String> GENRES=Map.ofEntries(Map.entry(28,"Ação"),Map.entry(12,"Aventura"),Map.entry(16,"Animação"),Map.entry(35,"Comédia"),Map.entry(80,"Crime"),Map.entry(99,"Documentário"),Map.entry(18,"Drama"),Map.entry(10751,"Família"),Map.entry(14,"Fantasia"),Map.entry(36,"História"),Map.entry(27,"Terror"),Map.entry(10402,"Música"),Map.entry(9648,"Mistério"),Map.entry(10749,"Romance"),Map.entry(878,"Ficção científica"),Map.entry(10770,"Cinema TV"),Map.entry(53,"Thriller"),Map.entry(10752,"Guerra"),Map.entry(37,"Faroeste"));
    record Suggestions(List<String> exclude,List<String> watched,List<String> liked,int page,Integer genre,List<Integer> genres,String type) {}
    record Candidate(Title title,JsonNode item,double score) {}
    private static List<Integer> selectedGenres(Integer genre,List<Integer> genres) {
        var selected=genres!=null?genres:genre==null||genre==0?List.<Integer>of():List.of(genre);
        if(selected.size()>GENRES.size()||selected.stream().anyMatch(g->g==null||!GENRES.containsKey(g)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        return selected.stream().distinct().toList();
    }
    private static List<Integer> roomGenreIds(String format,List<Integer> genres){
        if(!format.equals("tv"))return genres;
        // TMDB combines several film genres under shared TV categories.
        return genres.stream().map(id->switch(id){
            case 28,12 -> 10759;
            case 878,14 -> 10765;
            case 10752 -> 10768;
            default -> id;
        }).distinct().toList();
    }
    @PostMapping("/suggestions")
    Map<String,Object> suggestions(@RequestBody Suggestions input) {
        if(input.page()<1||input.page()>499||input.exclude()==null||input.exclude().size()>1000||input.watched()==null||input.watched().size()>10000||input.liked()==null||input.liked().size()>1000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var genres=selectedGenres(input.genre(),input.genres());
        var excluded=new HashSet<>(input.exclude());var watched=new HashSet<>(input.watched());
        var preferred=new HashSet<String>();
        for(String id:input.liked().stream().distinct().limit(40).toList()) {
            var rows=db.queryForList("select details from title where id=?",String.class,id);
            for(String json:rows)if(json!=null)try {for(var preferredGenre:mapper.readTree(json).path("genres"))preferred.add(preferredGenre.asText());}catch(Exception ignored){}
        }
        String type=input.type()==null?"movie":input.type();
        if(!Set.of("all","movie","tv","anime").contains(type))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Tipo de obra inválido.");
        var formats=type.equals("tv")||type.equals("movie")?List.of(type):List.of("movie","tv");
        if(token.isBlank())return Map.of("items",fixtures.stream().filter(t->formats.contains(t.format())&&(!type.equals("anime")||t.anime())&&!excluded.contains(t.id())&&(genres.isEmpty()||genres.stream().anyMatch(g->demoDetails(t.id()).genres().contains(GENRES.get(g))))).limit(20).toList(),"nextPage",input.page()+2);
        var buckets=new ArrayList<List<Candidate>>();
        var today=java.time.LocalDate.now(java.time.ZoneOffset.UTC);
        for(int tier=0;tier<3;tier++){
            var bucket=new ArrayList<Candidate>();
            for(String format:formats){
                String dateField=format.equals("tv")?"first_air_date":"primary_release_date";
                String sort=switch(tier){
                    case 0 -> "sort_by="+dateField+".desc&"+dateField+".gte="+today.minusMonths(12)+"&vote_count.gte=30";
                    case 1 -> "sort_by=vote_average.desc&vote_count.gte=300";
                    default -> "sort_by=popularity.desc&vote_count.gte=30";
                };
                List<Integer> ids=roomGenreIds(format,genres);
                String filter=ids.isEmpty()?"":"&with_genres="+ids.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining("%7C"));
                if(type.equals("anime"))filter="&with_original_language=ja&with_genres=16";
                String path="/discover/"+format+"?include_adult=false&"+dateField+".lte="+today+"&"+sort+filter;
                for(int page=input.page();page<input.page()+2;page++)for(var item:remote(path+"&page="+page).path("results")){
                    String date=item.path(format.equals("tv")?"first_air_date":"release_date").asText();
                    Title title=mapped(format,item);
                    if(date.isBlank()||date.compareTo(today.toString())>0||item.path("adult").asBoolean()||excluded.contains(title.id()))continue;
                    if(type.equals("anime")&&(!title.anime()||(!ids.isEmpty()&&java.util.stream.StreamSupport.stream(item.path("genre_ids").spliterator(),false).noneMatch(g->ids.contains(g.asInt())))))continue;
                    double votes=item.path("vote_count").asDouble();
                    double score=(votes*item.path("vote_average").asDouble()+300*6.5)/(votes+300);
                    if(!watched.contains(title.id()))score+=100;
                    if(!preferred.isEmpty()){
                        var cached=db.queryForList("select details from title where id=?",String.class,title.id());
                        if(!cached.isEmpty()&&cached.getFirst()!=null)try{
                            for(var g:mapper.readTree(cached.getFirst()).path("genres"))if(preferred.contains(g.asText())){score+=1.5;break;}
                        }catch(com.fasterxml.jackson.core.JsonProcessingException ignored){}
                    }
                    bucket.add(new Candidate(title,item,score));
                }
            }
            bucket.sort(Comparator.comparingDouble(Candidate::score).reversed());
            buckets.add(bucket);
        }
        var result=new ArrayList<Title>();var selected=new HashSet<>(excluded);
        int[] quotas={8,8,4};
        for(int b=0;b<3;b++){int taken=0;for(var c:buckets.get(b))if(selected.add(c.title().id())){storeSummary(c.title(),c.item());result.add(c.title());if(++taken==quotas[b])break;}}
        for(var bucket:buckets)for(var c:bucket){if(result.size()>=20)break;if(selected.add(c.title().id())){storeSummary(c.title(),c.item());result.add(c.title());}}
        Collections.shuffle(result);
        return Map.of("items",result,"nextPage",input.page()+2);
    }

    @GetMapping("/releases") List<Title> releases(){
        if(token.isBlank())return List.of();
        String today=java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString();
        String since=java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(90).toString();
        var result=new ArrayList<Title>();
        for(var item:remote("/discover/movie?include_adult=false&include_video=false&region=BR&with_release_type=2%7C3&release_date.gte="+since+"&release_date.lte="+today+"&sort_by=popularity.desc").path("results")){
            if(item.path("adult").asBoolean()||item.path("poster_path").asText("").isBlank()||item.path("poster_path").isNull())continue;
            result.add(mapped("movie",item));if(result.size()==6)break;
        }
        return result;
    }

    @GetMapping("/titles")

    Map<String,Object> titles(@RequestParam(defaultValue="") String query, @RequestParam(defaultValue="all") String type,

                              @RequestParam(defaultValue="1") int page) {

        if (page < 1 || page > 500 || query.length() > 100 || !Set.of("all","movie","tv","anime").contains(type))

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        if (token.isBlank()) {

            var found = fixtures.stream().filter(t -> type.equals("all") || type.equals(t.format()) || type.equals("anime") && t.anime())

                .filter(t -> normalize(t.name()).contains(normalize(query)) || normalize(t.original()).contains(normalize(query))).toList();

            return Map.of("items",page == 1 ? found : List.of(),"hasMore",false,"demo",true);

        }

        List<Title> found = new ArrayList<>();

        boolean more = false;

        for (String format : type.equals("movie") || type.equals("tv") ? List.of(type) : List.of("movie","tv")) {

            String params = "&page=" + page + "&include_adult=false";

            String path = query.isBlank() ? "/discover/" + format + "?sort_by=popularity.desc" + (type.equals("anime") ? "&with_genres=16&with_original_language=ja" : "") :

                "/search/" + format + "?query=" + URLEncoder.encode(query,StandardCharsets.UTF_8);

            JsonNode result = remote(path + params);

            more |= page < Math.min(result.path("total_pages").asInt(), 500);

            for (JsonNode item : result.path("results")) {

                Title title = mapped(format,item);

                if (!type.equals("anime") || title.anime()) { storeSummary(title,item); found.add(title); }

            }

        }

        return Map.of("items",found,"hasMore",more,"demo",false);

    }



    public record Season(int number,String name,String summary,String poster,String year) {}

    @GetMapping("/titles/{id}/seasons")
    List<Season> seasons(@PathVariable String id) {
        var series=detail(id);
        if(!"tv".equals(series.format()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if(id.startsWith("demo-")) {
            int total=series.details().seasons();
            return java.util.stream.IntStream.rangeClosed(1,total)
                .mapToObj(number->new Season(number,seasonName(number),"",null,series.year())).toList();
        }
        var result=new ArrayList<Season>();
        for(var row:remote("/tv/"+id.substring("tmdb-tv-".length())).path("seasons")) {
            if(!row.path("season_number").canConvertToInt())continue;
            int number=row.path("season_number").asInt();
            if(number<0||number>1000||(number==0&&row.path("episode_count").asInt()==0))continue;
            String name=text(row,"name");
            String date=text(row,"air_date");
            result.add(new Season(number,name.isBlank()?seasonName(number):name,text(row,"overview"),
                posterUrl(row,"w500"),date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")?date.substring(0,4):""));
        }
        result.sort(Comparator.comparingInt(item->item.number()==0?1001:item.number()));
        return result;
    }

    private static String seasonName(int number) {
        return number==0?"Especiais":"Temporada "+number;
    }

    public record Episode(int number,String name,String summary,String still) {}

    @GetMapping("/titles/{id}/seasons/{season}")

    List<Episode> episodes(@PathVariable String id,@PathVariable int season) {

        if(season<0 || season>1000 || !"tv".equals(detail(id).format()))

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        if(id.startsWith("demo-")) {

            if(season==2 && id.equals("demo-mare-alta"))
                return List.of(new Episode(1,"O retorno","Episódio ilustrativo.",null));
            if(season!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);

            return List.of(
                new Episode(1,"Piloto","Episódio ilustrativo.",null),
                new Episode(2,"Segundo episódio","Episódio ilustrativo.",null));

        }

        JsonNode data=remote("/tv/"+id.substring("tmdb-tv-".length())+"/season/"+season);

        List<Episode> result=new ArrayList<>();
        for(JsonNode episode:data.path("episodes"))
            result.add(new Episode(episode.path("episode_number").asInt(),text(episode,"name"),
                text(episode,"overview"),imageUrl(episode,"still_path","w780")));

        return result;

    }



    public record TimelineEntry(String key,String work,String title,String date,String kind,String poster) {}

    @GetMapping("/chronology/{id}")
    List<TimelineEntry> chronology(@PathVariable String id){
        if(!id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}"))throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if(token.isBlank())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        String[] parts=id.split("-");
        boolean movie=parts[1].equals("movie");
        String path="/"+parts[1]+"/"+parts[2];
        JsonNode work=remote(path);
        var result=new LinkedHashMap<String,TimelineEntry>();
        result.put(id,new TimelineEntry(id,id,text(work,movie?"title":"name"),text(work,movie?"release_date":"first_air_date"),movie?"Filme":"Série",posterUrl(work,"w185")));
        if(movie){
            long collection=work.path("belongs_to_collection").path("id").asLong();
            if(collection>0)for(var item:remote("/collection/"+collection).path("parts")){
                long tmdb=item.path("id").asLong();
                if(tmdb<=0||item.path("adult").asBoolean()||text(item,"title").isBlank())continue;
                String key="tmdb-movie-"+tmdb;
                result.putIfAbsent(key,new TimelineEntry(key,key,text(item,"title"),text(item,"release_date"),"Filme da coleção",posterUrl(item,"w185")));
            }
        }else{
            boolean specials=false;
            for(var season:work.path("seasons"))if(season.path("season_number").asInt(-1)==0&&season.path("episode_count").asInt()>0)specials=true;
            if(specials)for(var ep:remote(path+"/season/0").path("episodes")){
                String title=text(ep,"name");
                if(title.isBlank())continue;
                String key=id+"-special-"+ep.path("episode_number").asInt();
                boolean ova=java.util.regex.Pattern.compile("(?iu)\\b(?:OVA|OAV|OAD)\\b").matcher(title).find();
                result.put(key,new TimelineEntry(key,null,title,text(ep,"air_date"),ova?"OVA":"Especial",posterUrl(work,"w185")));
            }
        }
        return List.copyOf(result.values());
    }

    private static final java.util.regex.Pattern EPISODE_ID=java.util.regex.Pattern.compile("ep-((?:demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12}))-s(0|[1-9][0-9]{0,2}|1000)-e([1-9][0-9]{0,8})");

    private static final java.util.regex.Pattern SEASON_ID=java.util.regex.Pattern.compile("season-(demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12})-s(0|[1-9][0-9]{0,2}|1000)");

    private Title seasonDetail(String id, java.util.regex.Matcher key) {
        String seriesId=key.group(1);
        int number=Integer.parseInt(key.group(2));
        var season=seasons(seriesId).stream().filter(item->item.number()==number).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        var series=detail(seriesId);
        return storeSeriesPart(new Title(id,"seas",false,season.name(),series.name(),season.year(),season.summary(),season.poster()));
    }

    private Title episodeDetail(String id, java.util.regex.Matcher key) {
        String seriesId=key.group(1);
        int season=Integer.parseInt(key.group(2));
        int number=Integer.parseInt(key.group(3));
        var episode=episodes(seriesId,season).stream().filter(item->item.number()==number).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        var series=detail(seriesId);
        String name=episode.name().isBlank()?"Episódio "+number:episode.name();
        return storeSeriesPart(new Title(id,"ep",series.anime(),name,series.name(),series.year(),episode.summary(),episode.still()));
    }

    private Title storeSeriesPart(Title title) {
        try {
            db.update("insert into title(id,format,anime,name,original,release_year,summary,poster) values(?,?,?,?,?,?,?,?)",
                title.id(),title.format(),title.anime(),title.name(),title.original(),title.year(),title.summary(),title.poster());
        } catch (org.springframework.dao.DuplicateKeyException concurrentInsert) {
            // Outra consulta já armazenou os metadados.
        }
        return title;
    }

    @GetMapping("/titles/{id}") Title detail(@PathVariable String id) {

        var sample = fixtures.stream().filter(t -> t.id().equals(id)).findFirst();

        if (sample.isPresent()) return sample.get().withDetails(demoDetails(id));

        var stored = db.query("select * from title where id=?", (row,n) -> {

            Title title = new Title(row.getString("id"),row.getString("format"),row.getBoolean("anime"),row.getString("name"),row.getString("original"),row.getString("release_year"),row.getString("summary"),row.getString("poster"));

            String details = row.getString("details");

            if (details == null) return title;

            try { return title.withDetails(mapper.readValue(details,Details.class)); }

            catch (com.fasterxml.jackson.core.JsonProcessingException invalid) { return title; }

        },id);

        var episodeKey=EPISODE_ID.matcher(id);
        if(episodeKey.matches())return stored.isEmpty()?episodeDetail(id,episodeKey):stored.getFirst();
        var seasonKey=SEASON_ID.matcher(id);
        if(seasonKey.matches())return stored.isEmpty()?seasonDetail(id,seasonKey):stored.getFirst();

        if (!stored.isEmpty() && ((stored.getFirst().details()!=null && stored.getFirst().details().people()!=null) || token.isBlank())) return stored.getFirst();

        if (token.isBlank() || !id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);

        String[] parts = id.split("-");

        Title title;

        try {

            JsonNode item=remote("/" + parts[1] + "/" + parts[2] + (parts[1].equals("tv")?"?append_to_response=credits,aggregate_credits":"?append_to_response=credits"));

            title=mapped(parts[1],item).withDetails(details(parts[1],item));

        } catch (ResponseStatusException unavailable) {

            if (!stored.isEmpty()) return stored.getFirst();

            throw unavailable;

        }

        String details=mapper.valueToTree(title.details()).toString();

        if (!stored.isEmpty()) {

            db.update("update title set details=?,name=?,original=?,release_year=?,summary=?,poster=?,anime=? where id=?",

                details,title.name(),title.original(),title.year(),title.summary(),title.poster(),title.anime(),id);

            return title;

        }

        try {

            db.update("insert into title(id,format,anime,name,original,release_year,summary,poster,details) values(?,?,?,?,?,?,?,?,?)",title.id(),title.format(),title.anime(),title.name(),title.original(),title.year(),title.summary(),title.poster(),details);

        } catch (org.springframework.dao.DuplicateKeyException concurrentInsert) {

            return detail(id);

        }

        return title;

    }



    private static Details demoDetails(String id) {

        return switch (id) {

            case "demo-ultimo-rolo" -> new Details(List.of("Drama"),96,null,null,List.of(),List.of(),List.of());

            case "demo-mare-alta" -> new Details(List.of("Drama","Mistério"),null,2,3,List.of(),List.of(),List.of());

            case "demo-lua-de-papel" -> new Details(List.of("Animação","Fantasia"),104,null,null,List.of(),List.of(),List.of());

            case "demo-neon-norte" -> new Details(List.of("Animação","Aventura"),null,1,12,List.of(),List.of(),List.of());

            case "demo-fim-da-linha" -> new Details(List.of("Drama"),88,null,null,List.of(),List.of(),List.of());

            default -> new Details(List.of("Drama"),null,1,6,List.of(),List.of(),List.of());

        };

    }



    private static Details details(String format, JsonNode item) {

        boolean movie=format.equals("movie");

        JsonNode credits=item.path("credits");

        return new Details(names(item.path("genres"),null,8),movie?positive(item.path("runtime")):null,

            movie?null:positive(item.path("number_of_seasons")),movie?null:positive(item.path("number_of_episodes")),

            movie?names(credits.path("crew"),"Director",5):List.of(),names(item.path("created_by"),null,5),names(credits.path("cast"),null,8),people(item));

    }



    private static Integer positive(JsonNode value) { return value.asInt()>0?value.asInt():null; }



    private static List<String> names(JsonNode items,String job,int limit) {

        var names=new LinkedHashSet<String>();

        for(JsonNode item:items) {

            if(job!=null && !job.equals(item.path("job").asText())) continue;

            String name=item.path("name").asText("").strip();

            if(!name.isEmpty())names.add(name);

            if(names.size()==limit)break;

        }

        return List.copyOf(names);

    }



    private void storeSummary(Title title, JsonNode item) {
        var ids = new TreeSet<Integer>();
        JsonNode genres = item.path("genre_ids");
        if (genres.isArray()) {
            for (JsonNode genre : genres) {
                if (!genre.isIntegralNumber() || !genre.canConvertToInt() || genre.intValue() <= 0) {
                    ids.clear();
                    break;
                }
                ids.add(genre.intValue());
            }
        }
        String encoded = ids.isEmpty() ? null : ids.stream().map(String::valueOf)
            .collect(java.util.stream.Collectors.joining(","));
        var existing = db.queryForList("select genre_ids from title where id=?", String.class, title.id());
        if (existing.isEmpty()) {
            try {
                db.update("insert into title(id,format,anime,name,original,release_year,summary,poster,genre_ids) values(?,?,?,?,?,?,?,?,?)",
                    title.id(),title.format(),title.anime(),title.name(),title.original(),title.year(),title.summary(),title.poster(),encoded);
                return;
            } catch (org.springframework.dao.DuplicateKeyException concurrentInsert) {
                // A concurrent detail or summary request inserted the title.
            }
        }
        if (encoded != null && (existing.isEmpty() || !encoded.equals(existing.getFirst()))) {
            db.update("update title set genre_ids=? where id=?", encoded, title.id());
        }
    }

    public record ReviewRelease(String id,String name,java.time.LocalDate released,String poster) {}

    @PostMapping("/review-releases")
    List<ReviewRelease> reviewReleases(@RequestBody List<String> ids) {
        if(ids.size()>40) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var today=java.time.LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo"));
        var result=new ArrayList<ReviewRelease>();
        for(String id:new LinkedHashSet<>(ids)){
            if(!id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}")) continue;
            var cached=db.query("select d.name,d.released,t.poster from review_release_date d left join title t on t.id=d.title where d.title=? and d.checked_at>?",
                (r,n)->new ReviewRelease(id,r.getString(1),r.getObject(2,java.time.LocalDate.class),r.getString(3)),
                id,java.time.OffsetDateTime.now().minusDays(7));
            ReviewRelease release;
            if(!cached.isEmpty()) release=cached.getFirst();
            else {
                var years=db.queryForList("select release_year from title where id=?",String.class,id);
                if(!years.isEmpty() && years.getFirst()!=null && years.getFirst().matches("[0-9]{4}")
                        && !years.getFirst().equals(Integer.toString(today.getYear()))) continue;
                if(token.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
                var parts=id.split("-");
                JsonNode item;
                try { item=remote("/"+parts[1]+"/"+parts[2]); }
                catch(ResponseStatusException ex){
                    if(ex.getStatusCode().value()!=404) throw ex;
                    item=mapper.createObjectNode();
                }
                String date=item.path(parts[1].equals("movie")?"release_date":"first_air_date").asText("");
                var work=mapped(parts[1],item);
                if(!date.isBlank()) storeSummary(work,item);
                release=new ReviewRelease(id,work.name(),
                    date.isBlank()?null:java.time.LocalDate.parse(date),work.poster());
                if(db.update("update review_release_date set name=?,released=?,checked_at=CURRENT_TIMESTAMP where title=?",
                        release.name(),release.released(),id)==0){
                    try { db.update("insert into review_release_date(title,name,released,checked_at) values(?,?,?,CURRENT_TIMESTAMP)",
                        id,release.name(),release.released()); }
                    catch(org.springframework.dao.DuplicateKeyException concurrentInsert){ /* Another reader populated the cache. */ }
                }
            }
            if(release.released()!=null && !release.released().isBefore(today.withDayOfMonth(1)) && !release.released().isAfter(today))
                result.add(release);
        }
        return result;
    }

    @GetMapping("/title-batch") List<Title> batch(@RequestParam List<String> ids,@RequestParam(defaultValue="0") int genre,@RequestParam(required=false) List<Integer> genres) {

        var selected=selectedGenres(genre,genres);
        if (ids.size() > 30) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        var output = new ArrayList<Title>();

        for (String id : ids.stream().distinct().toList()) {

            fixtures.stream().filter(t -> t.id().equals(id)).findFirst().ifPresent(output::add);

        }

        var storedIds = ids.stream().distinct().filter(id -> id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}") || EPISODE_ID.matcher(id).matches() || SEASON_ID.matcher(id).matches()).toList();

        var matches = new HashMap<String, Boolean>();
        var filmIds = selected.stream().map(String::valueOf).toList();
        var tvIds = roomGenreIds("tv",selected).stream().map(String::valueOf).toList();
        if (!storedIds.isEmpty()) {

            String placeholders = String.join(",", Collections.nCopies(storedIds.size(), "?"));

            output.addAll(db.query("select * from title where id in (" + placeholders + ")",

                (row,n) -> {
                    String id = row.getString("id");
                    String encoded = row.getString("genre_ids");
                    if (!selected.isEmpty() && encoded != null)
                        matches.put(id, !Collections.disjoint("tv".equals(row.getString("format"))?tvIds:filmIds, Arrays.asList(encoded.split(","))));
                    return new Title(id,row.getString("format"),row.getBoolean("anime"),row.getString("name"),row.getString("original"),row.getString("release_year"),row.getString("summary"),row.getString("poster"));
                },storedIds.toArray()));

        }

        var missing=storedIds.stream().filter(id -> output.stream().noneMatch(t -> t.id().equals(id))).toList();
        if(!missing.isEmpty()) {
            try(var executor=java.util.concurrent.Executors.newFixedThreadPool(6)) {
                var tasks=missing.stream().map(id -> executor.submit(() -> {
                    try { return detail(id); }
                    catch(ResponseStatusException failure) {
                        if(failure.getStatusCode().value()==404)return null;
                        throw failure;
                    }
                })).toList();
                for(var task:tasks) {
                    try { Title title=task.get();if(title!=null)output.add(title); }
                    catch(InterruptedException interrupted) { Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida."); }
                    catch(java.util.concurrent.ExecutionException failure) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível carregar todos os títulos. Tente novamente."); }
                }
            }
        }
        if(!selected.isEmpty()) {
            var fallback = output.stream().filter(t -> !matches.containsKey(t.id())).toList();
            var matchedDetails = new HashMap<String,Title>();
            if (!fallback.isEmpty()) {
                try (var executor = java.util.concurrent.Executors.newFixedThreadPool(6)) {
                    var tasks = fallback.stream().map(t -> executor.submit(() -> t.details() == null ? detail(t.id()) : t)).toList();
                    for (var task : tasks) {
                        var title = task.get();
                        if (title.details() != null && selected.stream().anyMatch(g -> title.details().genres().contains(GENRES.get(g))))
                            matchedDetails.put(title.id(), title);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida.");
                } catch (java.util.concurrent.ExecutionException e) {
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível verificar os gêneros. Tente novamente.");
                }
            }
            var filtered = new ArrayList<Title>();
            for (var title : output) {
                if (Boolean.TRUE.equals(matches.get(title.id()))) filtered.add(title);
                else if (matchedDetails.containsKey(title.id())) filtered.add(matchedDetails.get(title.id()));
            }
            return filtered;
        }
        return output;

    }



    private JsonNode remote(String path) {

        try {

            String separator = path.contains("?") ? "&" : "?";

            var response = http.send(HttpRequest.newBuilder(URI.create(apiBase + path + separator + "language=pt-BR"))

                .timeout(Duration.ofSeconds(3)).header("Authorization","Bearer " + token).GET().build(),HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND);

            if (response.statusCode() == 401 || response.statusCode() == 403)

                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"O acesso ao TMDB precisa ser configurado.");

            if (response.statusCode() == 429)

                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"O TMDB limitou as consultas. Tente novamente em instantes.");

            if (response.statusCode() != 200) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo externo indisponível.");

            return mapper.readTree(response.body());

        } catch (InterruptedException interrupted) {

            Thread.currentThread().interrupt();

            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida.");

        } catch (java.io.IOException failure) {

            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo externo indisponível.");

        }

    }



    private static Title mapped(String format, JsonNode item) {

        boolean animation = false;

        for (JsonNode genre : item.path("genre_ids")) animation |= genre.asInt() == 16;

        for (JsonNode genre : item.path("genres")) animation |= genre.path("id").asInt() == 16;

        String date = item.path(format.equals("movie") ? "release_date" : "first_air_date").asText("");

        String original = item.path(format.equals("movie") ? "original_title" : "original_name").asText("");

        String name = item.path(format.equals("movie") ? "title" : "name").asText("");



        return new Title("tmdb-" + format + "-" + item.path("id").asLong(),format,animation && item.path("original_language").asText().equals("ja"),

            name.isBlank() ? original.isBlank() ? "Título indisponível" : original : name, original,

            date.length() >= 4 ? date.substring(0,4) : "",item.path("overview").asText(""),

            posterUrl(item,"w500"));

    }



    private static String normalize(String input) {

        return Normalizer.normalize(input,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT);

    }

}
