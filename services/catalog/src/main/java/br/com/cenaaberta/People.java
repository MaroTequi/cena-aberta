package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.*;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import static br.com.cenaaberta.TmdbMapper.*;

/** Pessoas (elenco e equipe): perfil e filmografia vindos do TMDB. */
@RestController
public class People {

    public record WorkCredit(String id,String title,String date,String poster,List<String> roles) {}
    public record Person(long id,String name,String photo,String biography,String birthday,String deathday,String birthplace,List<WorkCredit> works) {}
    /** Pessoa encontrada na busca: área em que é conhecida (ex.: "Acting") e até 3 obras conhecidas. */
    public record PersonResult(long id,String name,String photo,String department,List<String> knownFor) {}

    private final TmdbClient tmdb;

    People(TmdbClient tmdb) { this.tmdb = tmdb; }

    @GetMapping("/people/{id:[1-9][0-9]*}")
    Person person(@PathVariable long id){
        if(tmdb.demo())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        var data=tmdb.remote("/person/"+id+"?append_to_response=combined_credits");
        return new Person(id,text(data,"name"),portrait(data),text(data,"biography"),text(data,"birthday"),
            text(data,"deathday"),text(data,"place_of_birth"),filmography(data.path("combined_credits")));
    }

    /**
     * Busca pessoas por nome no TMDB. Tolera espaços repetidos, maiúsculas, acentos e erros de digitação do
     * mesmo jeito que a busca de obras (ver {@link SearchTerms}). No modo demo não há pessoas.
     * @param query nome procurado (2 a 100 caracteres)
     * @param page página do TMDB, de 1 a 500
     */
    @GetMapping("/people")
    Map<String,Object> search(@RequestParam(defaultValue="") String query,@RequestParam(defaultValue="1") int page){
        String term=SearchTerms.clean(query);
        if(term.length()<2||term.length()>100||page<1||page>500)throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if(tmdb.demo())return Map.of("items",List.of(),"hasMore",false,"demo",true,"approximate",false);
        var found=remote(term,page);
        String folded=SearchTerms.fold(term);
        if(page==1&&found.items().isEmpty()&&!folded.equals(term.toLowerCase(Locale.ROOT)))found=remote(folded,1);
        if(page>1||!found.items().isEmpty())return Map.of("items",found.items(),"hasMore",found.more(),"demo",false,"approximate",false);
        var cached=approximateCache.get(folded);
        if(cached!=null&&cached.getKey()>System.currentTimeMillis())return cached.getValue();
        var close=SearchTerms.firstClose(SearchTerms.attempts(term),attempt->remote(attempt,1).items(),candidates->{
            var unique=new LinkedHashMap<Long,PersonResult>();
            for(var person:candidates)unique.putIfAbsent(person.id(),person);
            return unique.values().stream()
                .map(person->Map.entry(person,SearchTerms.similarity(term,person.name())))
                .filter(entry->entry.getValue()>=SearchTerms.MIN_SIMILARITY)
                .sorted(Map.Entry.<PersonResult,Double>comparingByValue().reversed())
                .limit(20).map(Map.Entry::getKey).toList();
        });
        Map<String,Object> answer=Map.of("items",close,"hasMore",false,"demo",false,"approximate",!close.isEmpty());
        if(approximateCache.size()>=500)approximateCache.clear();
        approximateCache.put(folded,Map.entry(System.currentTimeMillis()+java.time.Duration.ofMinutes(10).toMillis(),answer));
        return answer;
    }

    /** Resultado das buscas aproximadas por 10 minutos, para o mesmo erro de digitação não refazer as consultas. */
    private final Map<String,Map.Entry<Long,Map<String,Object>>> approximateCache=new java.util.concurrent.ConcurrentHashMap<>();

    private record Found(List<PersonResult> items,boolean more){}

    private Found remote(String term,int page){
        var result=tmdb.remote("/search/person?query="+java.net.URLEncoder.encode(term,java.nio.charset.StandardCharsets.UTF_8)+"&page="+page+"&include_adult=false");
        var items=new ArrayList<PersonResult>();
        for(var row:result.path("results")){
            long id=row.path("id").asLong();
            String name=text(row,"name");
            if(id<=0||name.isBlank()||row.path("adult").asBoolean())continue;
            var known=new ArrayList<String>();
            for(var work:row.path("known_for")){
                String title=text(work,"movie".equals(text(work,"media_type"))?"title":"name");
                if(!title.isBlank()&&known.size()<3)known.add(title);
            }
            items.add(new PersonResult(id,name,portrait(row),text(row,"known_for_department"),known));
        }
        return new Found(items,page<Math.min(result.path("total_pages").asInt(),500));
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
}
