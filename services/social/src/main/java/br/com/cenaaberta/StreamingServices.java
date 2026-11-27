package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Serviços de streaming que a pessoa assina, usados para destacar onde assistir e filtrar as salas. */
@RestController
public class StreamingServices {

    /** Limite de serviços por pessoa e por sala; o Brasil tem bem menos serviços que isso. */
    static final int MAX_PROVIDERS = 60;

    public record ProvidersInput(List<Integer> providers) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;

    StreamingServices(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    /**
     * Serviços que o usuário assina.
     * @param actor usuário da sessão
     * @return {providers:[ids do TMDB em ordem crescente]}
     */
    @GetMapping("/me/providers")
    Map<String,Object> mine(@RequestHeader("X-Actor") String actor) {
        actors.requireActive(actor);
        return Map.of("providers",saved(actor));
    }

    /**
     * Substitui a lista de serviços que o usuário assina.
     * @param actor usuário da sessão
     * @param input ids do TMDB (até 60); lista vazia remove todos
     * @return {providers:[ids salvos em ordem crescente]}
     */
    @PutMapping("/me/providers")
    @Transactional
    Map<String,Object> save(@RequestHeader("X-Actor") String actor,@RequestBody ProvidersInput input) {
        actors.lockActive(actor);
        if(input.providers()==null) fail(HttpStatus.BAD_REQUEST,"Informe os serviços.");
        if(input.providers().stream().anyMatch(provider -> provider==null || provider<1)) fail(HttpStatus.BAD_REQUEST,"Serviço de streaming inválido.");
        var selected=new TreeSet<>(input.providers());
        if(selected.size()>MAX_PROVIDERS) fail(HttpStatus.BAD_REQUEST,"Escolha até "+MAX_PROVIDERS+" serviços.");
        db.update("delete from actor_provider where actor=?",actor);
        for(int provider:selected) db.update("insert into actor_provider(actor,provider) values(?,?)",actor,provider);
        return Map.of("providers",saved(actor));
    }

    private List<Integer> saved(String actor) {
        return db.queryForList("select provider from actor_provider where actor=? order by provider",Integer.class,actor);
    }
}
