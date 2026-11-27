package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Sessões de visualização (viewings) do diário: inserção e leitura paginada, compartilhadas pelos controllers. */
@Component
class Viewings {

    private static final int DIARY_PAGE_SIZE = 24;

    record DiaryPage(List<Map<String,Object>> items, boolean hasMore) {}

    private final JdbcTemplate db;

    Viewings(JdbcTemplate db) { this.db=db; }

    /** Insere uma sessão no diário e devolve o id gerado. */
    String insert(String actor,String title,LocalDate date,boolean rewatch,OffsetDateTime watchedAt) {
        String id=UUID.randomUUID().toString();
        db.update("insert into viewing(id,actor,title,watched_on,rewatch,watched_at) values(?,?,?,?,?,?)",
            id,actor,title,date,rewatch,watchedAt);
        return id;
    }

    /**
     * Página do diário de um usuário, da sessão mais recente para a mais antiga.
     * @param actor dono do diário
     * @param page página (1..), 24 itens
     * @param title obra para filtrar; null = todas
     */
    DiaryPage page(String actor, int page, String title) {
        var args = new ArrayList<Object>();
        args.add(actor);
        if (title != null) args.add(title);
        args.add(DIARY_PAGE_SIZE + 1);
        args.add((page - 1L) * DIARY_PAGE_SIZE);
        var rows = db.queryForList("select id,title,watched_on,rewatch,watched_at from viewing where actor=? "
                + (title == null ? "" : "and title=? ")
                + "order by watched_on desc nulls last, coalesce(watched_at,created) desc, id desc limit ? offset ?", args.toArray());
        return new DiaryPage(rows.subList(0, Math.min(rows.size(), DIARY_PAGE_SIZE)), rows.size() > DIARY_PAGE_SIZE);
    }
}
