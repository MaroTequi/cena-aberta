package br.com.cenaaberta;

import java.util.*;

import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/** Ponto de entrada do serviço social e healthcheck (/health, liberado sem chave pelo InternalKeyFilter). */
@SpringBootApplication
@RestController
public class Social {

    private final JdbcTemplate db;

    public static void main(String[] args) { SpringApplication.run(Social.class,args); }

    Social(JdbcTemplate db) { this.db=db; }

    @GetMapping("/health") Map<String,String> health() { db.queryForObject("select 1",Integer.class); return Map.of("status","ok"); }
}
