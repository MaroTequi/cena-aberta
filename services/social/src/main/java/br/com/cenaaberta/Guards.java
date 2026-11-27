package br.com.cenaaberta;

import java.time.*;

import org.springframework.http.HttpStatus;

import org.springframework.web.server.ResponseStatusException;

/** Validações e falhas HTTP compartilhadas pelas classes do serviço social. */
final class Guards {

    static final ZoneId DIARY_ZONE=ZoneId.of("America/Sao_Paulo");

    private Guards() {}

    /** Exige actor no formato de sessão válido; senão 401. */
    static void validateActor(String actor) { if(actor==null || !actor.matches("[A-Za-z0-9_-]{8,160}")) fail(HttpStatus.UNAUTHORIZED,"Sessão inválida."); }

    /** Exige identificador de título demo ou TMDB; senão 400. */
    static final java.util.regex.Pattern EPISODE_ID=java.util.regex.Pattern.compile("ep-((?:demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12}))-s(0|[1-9][0-9]{0,2}|1000)-e([1-9][0-9]{0,8})");
    static final java.util.regex.Pattern SEASON_ID=java.util.regex.Pattern.compile("season-(demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12})-s(0|[1-9][0-9]{0,2}|1000)");
    static void validateTitle(String id) { if(id==null || (!id.matches("demo-[a-z0-9-]{1,60}|tmdb-(movie|tv)-[1-9][0-9]{0,12}") && !EPISODE_ID.matcher(id).matches() && !SEASON_ID.matcher(id).matches())) fail(HttpStatus.BAD_REQUEST,"Identificador inválido."); }

    /** Rejeita datas no futuro (fuso de São Paulo); null é aceito. */
    static void checkDate(LocalDate date) { if(date!=null && date.isAfter(LocalDate.now(DIARY_ZONE))) fail(HttpStatus.BAD_REQUEST,"A data não pode estar no futuro."); }

    /** Texto aparado, não vazio e dentro do limite; senão 400. */
    static String required(String value,int limit) { String result=optional(value,limit); if(result.isBlank()) fail(HttpStatus.BAD_REQUEST,"Campo obrigatório."); return result; }

    /** Texto aparado (null vira vazio) dentro do limite; senão 400. */
    static String optional(String value,int limit) { String result=value==null?"":value.strip(); if(result.length()>limit) fail(HttpStatus.BAD_REQUEST,"Texto acima do limite de "+limit+" caracteres."); return result; }

    /** Lança ResponseStatusException com o status e a mensagem informados. */
    public static void fail(HttpStatus status,String message) { throw new ResponseStatusException(status,message); }

}
