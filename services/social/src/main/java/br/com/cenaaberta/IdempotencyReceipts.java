package br.com.cenaaberta;

import java.security.MessageDigest;

import java.time.*;

import java.util.*;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.http.HttpStatus;

import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.stereotype.Component;

import static br.com.cenaaberta.Guards.fail;

/** Recibos de idempotência: evitam repetir a mesma operação com a mesma chave em 24 h. */
@Component
class IdempotencyReceipts {

    private final JdbcTemplate db;

    private final ObjectMapper mapper;

    IdempotencyReceipts(JdbcTemplate db,ObjectMapper mapper) { this.db=db; this.mapper=mapper; }

    /** Devolve o id do recurso já criado com esta chave, ou null se não há recibo; 400 se a chave é inválida, 409 se o corpo difere. */
    String find(String actor,String action,String key,Object body) {

        if (key==null || !key.matches("[A-Za-z0-9_-]{8,80}")) fail(HttpStatus.BAD_REQUEST,"Chave de repetição inválida.");

        db.update("delete from request_receipt where actor=? and created<?",actor,OffsetDateTime.now(ZoneOffset.UTC).minusHours(24));

        var rows=db.queryForList("select body_hash,resource_id from request_receipt where actor=? and action=? and request_key=?",actor,action,key);

        if(rows.isEmpty()) return null;

        if(!hash(body).equals(rows.getFirst().get("body_hash"))) fail(HttpStatus.CONFLICT,"Chave já usada com outros dados.");

        return (String)rows.getFirst().get("resource_id");

    }

    /** Grava o recibo da operação concluída. */
    void save(String actor,String action,String key,Object body,String resourceId) {

        db.update("insert into request_receipt(actor,action,request_key,body_hash,resource_id) values(?,?,?,?,?)",actor,action,key,hash(body),resourceId);

    }

    private String hash(Object body) {

        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(body))); }

        catch (java.security.NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException failure) { throw new IllegalStateException(failure); }

    }

}
