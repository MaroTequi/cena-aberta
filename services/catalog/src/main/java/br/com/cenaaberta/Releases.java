package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Lançamentos: estreias recentes da home e obras lançadas no mês para as resenhas mensais. */
@RestController
public class Releases {

    public record ReviewRelease(String id,String name,java.time.LocalDate released,String poster) {}

    private final JdbcTemplate db;

    private final ObjectMapper mapper;

    private final TmdbClient tmdb;

    private final TitleSummaries summaries;

    Releases(JdbcTemplate db, ObjectMapper mapper, TmdbClient tmdb, TitleSummaries summaries) {
        this.db = db; this.mapper = mapper; this.tmdb = tmdb; this.summaries = summaries;
    }

    @GetMapping("/releases") List<Catalog.Title> releases(){
        if(tmdb.demo())return List.of();
        String today=java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString();
        String since=java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(90).toString();
        var result=new ArrayList<Catalog.Title>();
        for(var item:tmdb.remote("/discover/movie?include_adult=false&include_video=false&region=BR&with_release_type=2%7C3&release_date.gte="+since+"&release_date.lte="+today+"&sort_by=popularity.desc").path("results")){
            if(item.path("adult").asBoolean()||item.path("poster_path").asText("").isBlank()||item.path("poster_path").isNull())continue;
            result.add(TmdbMapper.title("movie",item));if(result.size()==6)break;
        }
        return result;
    }

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
                if(tmdb.demo()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
                var parts=id.split("-");
                JsonNode item;
                try { item=tmdb.remote("/"+parts[1]+"/"+parts[2]); }
                catch(ResponseStatusException ex){
                    if(ex.getStatusCode().value()!=404) throw ex;
                    item=mapper.createObjectNode();
                }
                String date=item.path(parts[1].equals("movie")?"release_date":"first_air_date").asText("");
                var work=TmdbMapper.title(parts[1],item);
                if(!date.isBlank()) summaries.store(work,item);
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
}
