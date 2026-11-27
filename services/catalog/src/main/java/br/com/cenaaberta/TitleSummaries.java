package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Cache do resumo das obras vistas em buscas e listas do TMDB (tabela title), com os ids de gênero. */
@Component
class TitleSummaries {

    private final JdbcTemplate db;

    TitleSummaries(JdbcTemplate db) { this.db = db; }

    /** Grava o resumo da obra se ela ainda não existe e atualiza genre_ids quando mudaram. */
    void store(Catalog.Title title, JsonNode item) {
        var ids = new TreeSet<Integer>();
        JsonNode genres = item.path("genre_ids");
        if (genres.isArray()) {
            for (JsonNode genre : genres) {
                if (!genre.isIntegralNumber() || !genre.canConvertToInt() || genre.intValue() <= 0) {
                    ids.clear();
                    break;
                }
                ids.add(genre.intValue());
            }
        }
        String encoded = ids.isEmpty() ? null : ids.stream().map(String::valueOf)
            .collect(java.util.stream.Collectors.joining(","));
        var existing = db.queryForList("select genre_ids from title where id=?", String.class, title.id());
        if (existing.isEmpty()) {
            try {
                db.update("insert into title(id,format,anime,name,original,release_year,summary,poster,genre_ids) values(?,?,?,?,?,?,?,?,?)",
                    title.id(),title.format(),title.anime(),title.name(),title.original(),title.year(),title.summary(),title.poster(),encoded);
                return;
            } catch (org.springframework.dao.DuplicateKeyException concurrentInsert) {
                // A concurrent detail or summary request inserted the title.
            }
        }
        if (encoded != null && (existing.isEmpty() || !encoded.equals(existing.getFirst()))) {
            db.update("update title set genre_ids=? where id=?", encoded, title.id());
        }
    }
}
