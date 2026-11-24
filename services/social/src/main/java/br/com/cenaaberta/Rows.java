package br.com.cenaaberta;

import java.time.*;
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

    /**
     * Normaliza um timestamp vindo do JDBC para ISO-8601 em UTC.
     * O H2 devolve OffsetDateTime e o driver do PostgreSQL devolve Timestamp; sem isso o JSON mudaria de formato por banco.
     * @param value valor lido da coluna (pode ser null)
     * @return instante ISO-8601 (ex.: 2026-11-24T15:00:00Z) ou null
     */
    static String instant(Object value) {
        return switch(value) {
            case null -> null;
            case java.sql.Timestamp timestamp -> timestamp.toInstant().toString();
            case OffsetDateTime offset -> offset.toInstant().toString();
            case Instant instant -> instant.toString();
            default -> value.toString();
        };
    }

    /**
     * Normaliza uma data (DATE) vinda do JDBC para AAAA-MM-DD.
     * @param value valor lido da coluna (pode ser null)
     * @return data ISO ou null
     */
    static String date(Object value) {
        return switch(value) {
            case null -> null;
            case java.sql.Date date -> date.toLocalDate().toString();
            default -> value.toString();
        };
    }
}
