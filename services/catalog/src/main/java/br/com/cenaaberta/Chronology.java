package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.*;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import static br.com.cenaaberta.TmdbMapper.*;

/** Cronologia de uma obra do TMDB: filmes da mesma coleção ou especiais/OVAs da série. */
@RestController
public class Chronology {

    public record TimelineEntry(String key,String work,String title,String date,String kind,String poster) {}

    private final TmdbClient tmdb;

    Chronology(TmdbClient tmdb) { this.tmdb = tmdb; }

    @GetMapping("/chronology/{id}")
    List<TimelineEntry> chronology(@PathVariable String id){
        if(!id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}"))throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if(tmdb.demo())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        String[] parts=id.split("-");
        boolean movie=parts[1].equals("movie");
        String path="/"+parts[1]+"/"+parts[2];
        JsonNode work=tmdb.remote(path);
        var result=new LinkedHashMap<String,TimelineEntry>();
        result.put(id,new TimelineEntry(id,id,text(work,movie?"title":"name"),text(work,movie?"release_date":"first_air_date"),movie?"Filme":"Série",posterUrl(work,"w185")));
        if(movie){
            long collection=work.path("belongs_to_collection").path("id").asLong();
            if(collection>0)for(var item:tmdb.remote("/collection/"+collection).path("parts")){
                long tmdb=item.path("id").asLong();
                if(tmdb<=0||item.path("adult").asBoolean()||text(item,"title").isBlank())continue;
                String key="tmdb-movie-"+tmdb;
                result.putIfAbsent(key,new TimelineEntry(key,key,text(item,"title"),text(item,"release_date"),"Filme da coleção",posterUrl(item,"w185")));
            }
        }else{
            boolean specials=false;
            for(var season:work.path("seasons"))if(season.path("season_number").asInt(-1)==0&&season.path("episode_count").asInt()>0)specials=true;
            if(specials)for(var ep:tmdb.remote(path+"/season/0").path("episodes")){
                String title=text(ep,"name");
                if(title.isBlank())continue;
                String key=id+"-special-"+ep.path("episode_number").asInt();
                boolean ova=java.util.regex.Pattern.compile("(?iu)\\b(?:OVA|OAV|OAD)\\b").matcher(title).find();
                result.put(key,new TimelineEntry(key,null,title,text(ep,"air_date"),ova?"OVA":"Especial",posterUrl(work,"w185")));
            }
        }
        return List.copyOf(result.values());
    }
}
