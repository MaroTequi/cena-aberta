package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;

import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.stereotype.Component;

import static br.com.cenaaberta.Guards.fail;
import static br.com.cenaaberta.Guards.validateActor;

/** Garante que o perfil do actor existe e não está suspenso. */
@Component
class ActiveActors {

    private final JdbcTemplate db;

    ActiveActors(JdbcTemplate db) { this.db=db; }

    /** Valida o actor e exige perfil ativo; 401, 404 ou 403 conforme o caso. */
    void requireActive(String actor) { validateActor(actor); checkActive(Rows.one(db,"select active from profile where actor=?",actor)); }

    /** Igual a requireActive, mas trava a linha do perfil até o fim da transação. */
    void lockActive(String actor) { validateActor(actor); checkActive(Rows.one(db,"select active from profile where actor=? for update",actor)); }

    static void checkActive(Map<String,Object> row) { if(!Boolean.TRUE.equals(row.get("active"))) fail(HttpStatus.FORBIDDEN,"Acesso suspenso."); }


}
