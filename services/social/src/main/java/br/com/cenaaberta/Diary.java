package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import com.fasterxml.jackson.annotation.JsonInclude;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Sessões de visualização (viewings) do diário. */
@RestController
public class Diary {

    public record Viewing(String title,LocalDate date,boolean rewatch,
                          @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime watchedAt) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final IdempotencyReceipts receipts;
    private final LibraryEntries entries;
    private final Episodes episodes;

    /** LibraryEntries é necessário porque createViewing garante a linha da biblioteca antes de registrar. */
    Diary(JdbcTemplate db,ActiveActors actors,IdempotencyReceipts receipts,LibraryEntries entries,Episodes episodes) { this.episodes=episodes;
        this.db=db; this.actors=actors; this.receipts=receipts; this.entries=entries;
    }

    @PostMapping("/me/viewings")
    @Transactional
    Map<String,String> createViewing(@RequestHeader("X-Actor") String actor,@RequestHeader("Idempotency-Key") String key,@RequestBody Viewing input) {
        actors.lockActive(actor);
        LocalDate date=input.watchedAt()==null?input.date():input.watchedAt().atZoneSameInstant(DIARY_ZONE).toLocalDate();
        checkDate(date);
        String prior=receipts.find(actor,"viewing",key,input);
        if (prior!=null) return Map.of("id",prior);
        entries.ensure(actor,input.title());
        var seasonKey=SEASON_ID.matcher(input.title());
        boolean canRewatch;
        if(seasonKey.matches()) {
            String series=seasonKey.group(1);
            int season=Integer.parseInt(seasonKey.group(2));
            canRewatch=episodes.seasonRewatched(actor,"ep-"+series+"-s"+season+"-e",episodes.seasonEpisodes(series,season));
        } else {
            canRewatch=Rows.exists(db,"select count(*) from library where actor=? and title=? and rewatching=true",actor,input.title());
        }
        if(!input.rewatch()||!canRewatch)
            fail(HttpStatus.CONFLICT,seasonKey.matches()?"Registre duas sessões de cada episódio primeiro.":"Marque Vi novamente para registrar outra sessão.");

        String id=insertViewing(actor,input.title(),date,true,input.watchedAt());
        entries.markWatched(actor,input.title());
        receipts.save(actor,"viewing",key,input,id);
        return Map.of("id",id);
    }
    /** Insere uma sessão no diário e devolve o id gerado. */
    public String insertViewing(String actor,String title,LocalDate date,boolean rewatch,OffsetDateTime watchedAt) {
        String id=UUID.randomUUID().toString();
        db.update("insert into viewing(id,actor,title,watched_on,rewatch,watched_at) values(?,?,?,?,?,?)",
            id,actor,title,date,rewatch,watchedAt);
        return id;
    }
    @PutMapping("/me/viewings/{id}")
    @Transactional
    void editViewing(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody Viewing input) {
        actors.lockActive(actor); checkDate(input.date());
        if (db.update("""
                update viewing set watched_at=case when watched_on=? then watched_at else null end,
                watched_on=?,rewatch=? where id=? and actor=?
                """,input.date(),input.date(),input.rewatch(),id,actor)==0)
            fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");
    }
    @DeleteMapping("/me/viewings/{id}")
    @Transactional
    void deleteViewing(@RequestHeader("X-Actor") String actor,@PathVariable String id) {
        actors.lockActive(actor);
        if (db.update("delete from viewing where id=? and actor=?",id,actor)==0) fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");
    }

}
