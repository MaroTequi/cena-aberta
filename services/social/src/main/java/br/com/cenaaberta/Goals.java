package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Meta anual de obras distintas vistas (contadas pelo diário). */
@RestController
public class Goals {

    public record GoalInput(Integer year,Integer target) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;

    Goals(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    /**
     * Meta e progresso de um ano.
     * @param actor usuário da sessão
     * @param year ano (1900..2200); padrão = ano atual em São Paulo
     * @return {year,target|null,done}
     */
    @GetMapping("/me/goal")
    Map<String,Object> goal(@RequestHeader("X-Actor") String actor,@RequestParam(required=false) Integer year) {
        actors.requireActive(actor);
        return progress(actor,checkYear(year==null?LocalDate.now(DIARY_ZONE).getYear():year));
    }

    /**
     * Define (1..1000) ou remove (null) a meta do ano.
     * @param actor usuário da sessão
     * @param input ano e meta
     * @return {year,target|null,done}
     */
    @PutMapping("/me/goal")
    @Transactional
    Map<String,Object> save(@RequestHeader("X-Actor") String actor,@RequestBody GoalInput input) {
        actors.lockActive(actor);
        if(input.year()==null) fail(HttpStatus.BAD_REQUEST,"Informe o ano.");
        int year=checkYear(input.year());
        Integer target=input.target();
        if(target!=null && (target<1 || target>1000)) fail(HttpStatus.BAD_REQUEST,"A meta deve ficar entre 1 e 1000 obras.");
        db.update("delete from annual_goal where actor=? and goal_year=?",actor,year);
        if(target!=null) db.update("insert into annual_goal(actor,goal_year,target) values(?,?,?)",actor,year,target);
        return progress(actor,year);
    }

    private static int checkYear(int year) {
        if(year<1900 || year>2200) fail(HttpStatus.BAD_REQUEST,"Ano inválido.");
        return year;
    }

    private Map<String,Object> progress(String actor,int year) {
        var targets=db.queryForList("select target from annual_goal where actor=? and goal_year=?",Integer.class,actor,year);
        int done=db.queryForObject("select count(distinct title) from viewing where actor=? and watched_on>=? and watched_on<?",Integer.class,
            actor,LocalDate.of(year,1,1),LocalDate.of(year+1,1,1));
        var result=new LinkedHashMap<String,Object>();
        result.put("year",year);
        result.put("target",targets.isEmpty()?null:targets.getFirst());
        result.put("done",done);
        return result;
    }
}
