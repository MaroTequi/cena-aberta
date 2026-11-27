package br.com.cenaaberta;

import java.util.*;

import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/**
 * Ponto de entrada do serviço de catálogo, healthcheck (/health, liberado sem chave pelo InternalKeyFilter)
 * e os registros compartilhados pelos controllers (obra, detalhes e crédito de pessoa).
 */
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

    private final JdbcTemplate db;

    public static void main(String[] args) { SpringApplication.run(Catalog.class, args); }

    Catalog(JdbcTemplate db) { this.db = db; }

    @GetMapping("/health") Map<String,String> health() { db.queryForObject("select 1", Integer.class); return Map.of("status","ok"); }
}
