package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.Guards.fail;

/** Regra única de "amigo aceito" para as funcionalidades que mostram dados de terceiros. */
final class Friendships {

    /** Subconsulta com os actors amigos aceitos de ?; usa o mesmo actor três vezes como parâmetro. */
    static final String FRIENDS_OF="select case when f.requester=? then f.recipient else f.requester end from friendship f "
        + "where (f.requester=? or f.recipient=?) and f.status='accepted'";

    private Friendships() {}

    /** Parâmetros de FRIENDS_OF para o actor informado. */
    static Object[] friendsOfArgs(String actor) { return new Object[]{actor,actor,actor}; }

    /**
     * Diz se dois actors são amigos aceitos.
     * @param db conexão
     * @param a um actor
     * @param b outro actor
     * @return true se existe amizade aceita em qualquer direção
     */
    static boolean accepted(JdbcTemplate db,String a,String b) {
        return Rows.exists(db,"select count(*) from friendship where status='accepted' and ((requester=? and recipient=?) or (requester=? and recipient=?))",a,b,b,a);
    }

    /**
     * Resolve um amigo aceito e ativo pelo username.
     * @param db conexão
     * @param actor usuário da sessão
     * @param username username do amigo
     * @return linha do perfil (actor,username,name,avatar); 404 se não existe, 400 se é o próprio, 403 se não é amigo
     */
    static Map<String,Object> requireFriend(JdbcTemplate db,String actor,String username) {
        var friend=Rows.one(db,"select actor,username,name,avatar from profile where username=? and active=true",ProfileFields.username(username));
        if(actor.equals(friend.get("actor"))) fail(HttpStatus.BAD_REQUEST,"Escolha outra pessoa.");
        if(!accepted(db,actor,(String)friend.get("actor"))) fail(HttpStatus.FORBIDDEN,"Disponível apenas para amigos.");
        return friend;
    }

    /** Cartão público de uma pessoa: {username,name,avatar}, com avatar vazio no lugar de null. */
    static Map<String,Object> person(Map<String,Object> row) {
        var person=new LinkedHashMap<String,Object>();
        person.put("username",row.get("username")); person.put("name",row.get("name")); person.put("avatar",Objects.toString(row.get("avatar"),""));
        return person;
    }
}
