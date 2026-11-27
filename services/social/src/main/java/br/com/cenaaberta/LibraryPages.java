package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import static br.com.cenaaberta.Guards.*;

/** Leitura paginada da biblioteca (assistidos ou Vou ver), própria ou de outra pessoa, com filtros e ordenação. */
@RestController
public class LibraryPages {

    static final Set<String> LIBRARY_SORTS=Set.of("title","recent","rating","name","year");
    static final Set<String> CATALOG_FILTERS=Set.of("movie","tv","anime");
    /** Teto de linhas lidas quando o filtro/ordem depende do catálogo (mesmo teto de 1000 do painel, com folga). */
    static final int CATALOG_SCAN=2000;

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final CatalogTitles catalog;
    private final ProfileVisibilities visibilities;

    LibraryPages(JdbcTemplate db,ActiveActors actors,CatalogTitles catalog,ProfileVisibilities visibilities) {
        this.db=db; this.actors=actors; this.catalog=catalog; this.visibilities=visibilities;
    }

    /**
     * Página da biblioteca (assistidos ou Vou ver), própria ou de outra pessoa.
     * @param actor usuário da sessão
     * @param section watched | watchlist
     * @param page página (1..), 24 itens
     * @param username dono da biblioteca; ausente = o próprio usuário
     * @param sort title (padrão, ordem antiga por id) | recent | rating | name | year
     * @param filter all (padrão) | unrated | rated | min:N (1..10) | movie | tv | anime
     * @return {items,pages}
     */
    @GetMapping("/library-page")
    Map<String,Object> libraryPage(@RequestHeader("X-Actor") String actor, @RequestParam String section,
                                   @RequestParam int page, @RequestParam(required=false) String username,
                                   @RequestParam(defaultValue="title") String sort, @RequestParam(defaultValue="all") String filter) {
        actors.requireActive(actor);
        if (page < 1 || !Set.of("watched","watchlist").contains(section))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (!LIBRARY_SORTS.contains(sort) || !(Set.of("all","unrated","rated").contains(filter) || CATALOG_FILTERS.contains(filter) || filter.matches("min:(10|[1-9])")))
            fail(HttpStatus.BAD_REQUEST,"Filtro ou ordenação inválidos.");
        String owner = actor;
        boolean visitor = username != null;
        if (visitor) {
            owner = (String)Rows.one(db,"select actor from profile where username=? and active=true", ProfileFields.username(username)).get("actor");
            if (!Boolean.TRUE.equals(visibilities.read(owner).get(section)))
                throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        boolean watchlist = section.equals("watchlist");
        String predicate = watchlist ? "interest=true" : visitor
                ? "(watched=true or (evaluation_public=true and hidden=false and (rating is not null or review is not null)))"
                : "(watched=true or rating is not null or review is not null)";
        String fields = watchlist ? "title" : visitor
                ? "title,rewatching,case when evaluation_public and not hidden then rating end as rating,"
                    + "case when evaluation_public and not hidden then review end as review,"
                    + "case when evaluation_public and not hidden then "+Community.EFFECTIVE_SPOILER+" else false end as spoiler,version,"
                    + Community.MY_SPOILER_VOTE+" as my_vote,exists(select 1 from library viewer where viewer.actor=? and viewer.title=l.title and viewer.watched) as viewer_watched"
                : "title,rewatching,rating,review,spoiler";
        // Visitante só filtra/ordena pela nota que consegue ver; senão a ordem vazaria notas privadas.
        String rating = visitor ? "case when l.evaluation_public and not l.hidden then l.rating end" : "l.rating";
        if (filter.equals("unrated")) predicate += " and " + rating + " is null";
        else if (filter.equals("rated")) predicate += " and " + rating + " is not null";
        else if (filter.startsWith("min:")) predicate += " and " + rating + " >= " + Integer.parseInt(filter.substring(4));
        // "recent" usa a última sessão do diário; para visitante só quando o diário é público (a ordem revelaria datas).
        // O Vou ver não tem data própria, então lá "recent" cai na ordem padrão.
        boolean recent = sort.equals("recent") && !watchlist && (!visitor || Boolean.TRUE.equals(visibilities.read(owner).get("diary")));
        String order = sort.equals("rating") ? rating + " desc nulls last,l.title"
                : recent ? "(select max(coalesce(v.watched_at,v.created)) from viewing v where v.actor=l.actor and v.title=l.title) desc nulls last,l.title"
                : "l.title";
        int size = 24;
        boolean catalogMode = sort.equals("name") || sort.equals("year") || CATALOG_FILTERS.contains(filter);
        var args = new ArrayList<Object>();
        if (visitor && !watchlist) { args.add(actor); args.add(actor); }
        args.add(owner);
        if (catalogMode) args.add(CATALOG_SCAN);
        else { args.add(size); args.add((page-1L)*size); }
        var rows = db.queryForList("select " + fields + ",count(*) over() as total from library l where actor=? and "
                + predicate + " order by " + order + " limit ?" + (catalogMode ? "" : " offset ?"),args.toArray());
        long total = rows.isEmpty() ? 0 : ((Number)rows.getFirst().get("total")).longValue();
        rows.forEach(row -> row.remove("total"));
        if (catalogMode) {
            rows = catalogPage(rows,sort,filter);
            total = rows.size();
            rows = rows.subList((int)Math.min(rows.size(),(page-1L)*size),(int)Math.min(rows.size(),(long)page*size));
        }
        return Map.of("items",rows,"pages",(total + size - 1)/size);
    }

    /** Filtra por formato e/ou ordena por nome/ano com metadados do catálogo; a ordem SQL anterior desempata (sort estável). */
    private List<Map<String,Object>> catalogPage(List<Map<String,Object>> rows,String sort,String filter) {
        var meta = rows.isEmpty() ? Map.<String,com.fasterxml.jackson.databind.JsonNode>of()
                : catalog.titles(rows.stream().map(row -> (String)row.get("title")).toList(),false);
        var result = new ArrayList<Map<String,Object>>();
        for (var row : rows) {
            var title = meta.get((String)row.get("title"));
            if (CATALOG_FILTERS.contains(filter)) {
                if (title == null) continue;
                String format = title.path("anime").asBoolean() ? "anime" : title.path("format").asText();
                if (!format.equals(filter)) continue;
            }
            result.add(row);
        }
        if (sort.equals("name")) {
            var collator = java.text.Collator.getInstance(Locale.forLanguageTag("pt-BR"));
            result.sort(Comparator.comparing((Map<String,Object> row) -> {
                var title = meta.get((String)row.get("title"));
                return title == null ? null : title.path("name").asText();
            }, Comparator.nullsLast(collator::compare)));
        } else if (sort.equals("year")) {
            result.sort(Comparator.comparing((Map<String,Object> row) -> {
                var title = meta.get((String)row.get("title"));
                return title == null || !title.path("year").asText().matches("\\d{4}") ? null : Integer.valueOf(title.path("year").asText());
            }, Comparator.nullsLast(Comparator.<Integer>reverseOrder())));
        }
        return result;
    }
}
