package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Retrospectiva anual do usuário, calculada a partir do diário (viewing), das notas e do catálogo. */
@RestController
public class Stats {

    static final int TOP=5;

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final CatalogTitles catalog;

    Stats(JdbcTemplate db,ActiveActors actors,CatalogTitles catalog) { this.db=db; this.actors=actors; this.catalog=catalog; }

    /**
     * Estatísticas de um ano do diário.
     * @param actor usuário da sessão
     * @param year ano (1900..2200); padrão = ano atual em São Paulo
     * @return números do ano; ver contrato em docs/superpowers/specs/2026-11-24-usuario-comum-contrato-api.md
     */
    @GetMapping("/me/stats")
    Map<String,Object> stats(@RequestHeader("X-Actor") String actor,@RequestParam(required=false) Integer year) {
        actors.requireActive(actor);
        int selected=year==null?LocalDate.now(DIARY_ZONE).getYear():year;
        if(selected<1900 || selected>2200) fail(HttpStatus.BAD_REQUEST,"Ano inválido.");
        var sessions=db.queryForList("select title,watched_on,rewatch from viewing where actor=? and watched_on>=? and watched_on<?",
            actor,LocalDate.of(selected,1,1),LocalDate.of(selected+1,1,1));
        var titles=new LinkedHashSet<String>();
        int[] byMonth=new int[12];
        int rewatches=0;
        for(var session:sessions) {
            titles.add((String)session.get("title"));
            byMonth[LocalDate.parse(Rows.date(session.get("watched_on"))).getMonthValue()-1]++;
            if(Boolean.TRUE.equals(session.get("rewatch"))) rewatches++;
        }
        Map<String,JsonNode> meta=titles.isEmpty()?Map.of():catalog.titles(titles,true);
        // Minutos somam cada sessão (rever conta de novo), mas só de filmes: a duração de série é por episódio e o diário não guarda episódios.
        long minutes=0;
        for(var session:sessions) {
            JsonNode title=meta.get((String)session.get("title"));
            if(title!=null && "movie".equals(title.path("format").asText()) && title.path("details").path("runtime").isNumber())
                minutes+=title.path("details").path("runtime").asInt();
        }
        var formats=new LinkedHashMap<String,Integer>(Map.of("movie",0,"tv",0,"anime",0));
        var genres=new HashMap<String,Integer>();
        for(String id:titles) {
            JsonNode title=meta.get(id);
            if(title==null) continue;
            String format=title.path("anime").asBoolean()?"anime":title.path("format").asText();
            formats.computeIfPresent(format,(key,count) -> count+1);
            for(JsonNode genre:title.path("details").path("genres")) genres.merge(genre.asText(),1,Integer::sum);
        }
        var result=new LinkedHashMap<String,Object>();
        result.put("year",selected);
        result.put("years",years(actor));
        result.put("viewings",sessions.size());
        result.put("distinctTitles",titles.size());
        result.put("rewatches",rewatches);
        result.put("minutes",minutes);
        result.put("byMonth",byMonth);
        result.put("byFormat",Map.of("movie",formats.get("movie"),"tv",formats.get("tv"),"anime",formats.get("anime")));
        result.put("topGenres",genres.entrySet().stream()
            .sorted(Map.Entry.<String,Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
            .limit(TOP).map(entry -> Map.of("name",entry.getKey(),"count",entry.getValue())).toList());
        result.putAll(ratings(actor,titles));
        return result;
    }

    private List<Integer> years(String actor) {
        return db.queryForList("select distinct extract(year from watched_on) as y from viewing where actor=? and watched_on is not null",actor)
            .stream().map(row -> ((Number)row.get("y")).intValue()).sorted(Comparator.reverseOrder()).toList();
    }

    /** Notas (escala 1..10 da library) das obras vistas no ano; séries não têm nota própria e ficam de fora. */
    private Map<String,Object> ratings(String actor,Set<String> titles) {
        var rated=db.queryForList("select title,rating from library where actor=? and rating is not null",actor).stream()
            .filter(row -> titles.contains((String)row.get("title"))).toList();
        int[] histogram=new int[10];
        double sum=0;
        for(var row:rated) { int rating=((Number)row.get("rating")).intValue(); histogram[rating-1]++; sum+=rating; }
        var result=new LinkedHashMap<String,Object>();
        result.put("averageRating",rated.isEmpty()?null:Math.round(sum/rated.size()*100)/100.0);
        result.put("ratingHistogram",histogram);
        result.put("topRated",rated.stream()
            .sorted(Comparator.<Map<String,Object>>comparingInt(row -> -((Number)row.get("rating")).intValue()).thenComparing(row -> (String)row.get("title")))
            .limit(TOP).map(row -> Map.of("title",row.get("title"),"rating",((Number)row.get("rating")).intValue())).toList());
        return result;
    }
}
