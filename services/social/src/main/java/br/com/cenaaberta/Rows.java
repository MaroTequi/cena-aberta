package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.Guards.fail;

/** Consultas de linha única compartilhadas pelas classes do serviço social. */
final class Rows {

    private Rows() {}

    /** Diz se a consulta de contagem devolve mais de zero; sql é um count(*) e args seus parâmetros. */
    static boolean exists(JdbcTemplate db,String sql,Object... args) { return db.queryForObject(sql,Integer.class,args)>0; }

    /** Devolve a primeira linha da consulta; 404 "Registro não encontrado." quando não há nenhuma. */
    static Map<String,Object> one(JdbcTemplate db,String sql,Object... args) {
        var rows=db.queryForList(sql,args);
        if(rows.isEmpty()) fail(HttpStatus.NOT_FOUND,"Registro não encontrado.");
        return rows.getFirst();
    }
}
