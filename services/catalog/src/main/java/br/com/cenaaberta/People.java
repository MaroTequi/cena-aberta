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

    private final TmdbClient tmdb;

    People(TmdbClient tmdb) { this.tmdb = tmdb; }

    @GetMapping("/people/{id:[1-9][0-9]*}")
    Person person(@PathVariable long id){
        if(tmdb.demo())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        var data=tmdb.remote("/person/"+id+"?append_to_response=combined_credits");
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
}
