package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import static br.com.cenaaberta.DemoTitles.*;
import static br.com.cenaaberta.Genres.*;

/** Sugestões de obras para as salas de votação: recentes, mais bem avaliadas e populares, com cotas por faixa. */
@RestController
public class RoomSuggestions {

    record Suggestions(List<String> exclude,List<String> watched,List<String> liked,int page,Integer genre,List<Integer> genres,String type,List<Integer> providers) {
        Suggestions(List<String> exclude,List<String> watched,List<String> liked,int page,Integer genre,List<Integer> genres,String type) {
            this(exclude,watched,liked,page,genre,genres,type,null);
        }
    }
    record Candidate(Catalog.Title title,JsonNode item,double score) {}

    private final JdbcTemplate db;

    private final ObjectMapper mapper;

    private final TmdbClient tmdb;

    private final TitleSummaries summaries;

    RoomSuggestions(JdbcTemplate db, ObjectMapper mapper, TmdbClient tmdb, TitleSummaries summaries) {
        this.db = db; this.mapper = mapper; this.tmdb = tmdb; this.summaries = summaries;
    }

    @PostMapping("/suggestions")
    Map<String,Object> suggestions(@RequestBody Suggestions input) {
        if(input.page()<1||input.page()>499||input.exclude()==null||input.exclude().size()>1000||input.watched()==null||input.watched().size()>10000||input.liked()==null||input.liked().size()>1000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var genres=selectedGenres(input.genre(),input.genres());
        // Serviços que a sala assina: quando informados, só entram obras incluídas em algum deles.
        if(input.providers()!=null&&input.providers().stream().anyMatch(p->p==null||p<1))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Serviço de streaming inválido.");
        Set<Integer> providers=input.providers()==null?Set.of():new TreeSet<>(input.providers());
        if(providers.size()>StreamingAvailability.MAX_FILTER_PROVIDERS)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Serviço de streaming inválido.");
        String providerFilter=providers.isEmpty()?"":"&watch_region="+StreamingAvailability.REGION+"&with_watch_monetization_types=flatrate%7Cfree%7Cads&with_watch_providers="
            +providers.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining("%7C"));
        var excluded=new HashSet<>(input.exclude());var watched=new HashSet<>(input.watched());
        var preferred=new HashSet<String>();
        for(String id:input.liked().stream().distinct().limit(40).toList()) {
            var rows=db.queryForList("select details from title where id=?",String.class,id);
            for(String json:rows)if(json!=null)try {for(var preferredGenre:mapper.readTree(json).path("genres"))preferred.add(preferredGenre.asText());}catch(Exception ignored){}
        }
        String type=input.type()==null?"movie":input.type();
        if(!Set.of("all","movie","tv","anime").contains(type))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Tipo de obra inválido.");
        var formats=type.equals("tv")||type.equals("movie")?List.of(type):List.of("movie","tv");
        if(tmdb.demo())return Map.of("items",FIXTURES.stream().filter(t->formats.contains(t.format())&&(!type.equals("anime")||t.anime())&&!excluded.contains(t.id())&&(providers.isEmpty()||StreamingAvailability.demoIncludedIn(t.id(),providers))&&(genres.isEmpty()||genres.stream().anyMatch(g->demoDetails(t.id()).genres().contains(GENRES.get(g))))).limit(20).toList(),"nextPage",input.page()+2);
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
                String path="/discover/"+format+"?include_adult=false&"+dateField+".lte="+today+"&"+sort+filter+providerFilter;
                for(int page=input.page();page<input.page()+2;page++)for(var item:tmdb.remote(path+"&page="+page).path("results")){
                    String date=item.path(format.equals("tv")?"first_air_date":"release_date").asText();
                    Catalog.Title title=TmdbMapper.title(format,item);
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
        var result=new ArrayList<Catalog.Title>();var selected=new HashSet<>(excluded);
        int[] quotas={8,8,4};
        for(int b=0;b<3;b++){int taken=0;for(var c:buckets.get(b))if(selected.add(c.title().id())){summaries.store(c.title(),c.item());result.add(c.title());if(++taken==quotas[b])break;}}
        for(var bucket:buckets)for(var c:bucket){if(result.size()>=20)break;if(selected.add(c.title().id())){summaries.store(c.title(),c.item());result.add(c.title());}}
        Collections.shuffle(result);
        return Map.of("items",result,"nextPage",input.page()+2);
    }
}
