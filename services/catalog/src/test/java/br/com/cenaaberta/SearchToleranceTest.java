package br.com.cenaaberta;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import static org.junit.jupiter.api.Assertions.*;

/** Busca tolerante: espaços, maiúsculas, acentos e erros de digitação, em obras e pessoas. */
class SearchToleranceTest {

    HttpServer tmdb;
    /** Resposta do TMDB falso por caminho + termo buscado (ex.: "/search/movie|naruto"). */
    final Map<String, String> answers = new ConcurrentHashMap<>();
    final List<String> searched = new CopyOnWriteArrayList<>();
    final ObjectMapper mapper = new ObjectMapper();
    JdbcTemplate db;

    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__catalog.sql"), new ClassPathResource("db/migration/V2__title_details.sql"),
            new ClassPathResource("db/migration/V3__title_genre_ids.sql")).execute(source);
        db = new JdbcTemplate(source);
        tmdb = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        tmdb.createContext("/", exchange -> {
            String query = "";
            for (String pair : Objects.toString(exchange.getRequestURI().getRawQuery(), "").split("&"))
                if (pair.startsWith("query=")) query = URLDecoder.decode(pair.substring(6), StandardCharsets.UTF_8);
            String path = exchange.getRequestURI().getPath();
            searched.add(path + "|" + query);
            byte[] bytes = answers.getOrDefault(path + "|" + query, "{\"results\":[],\"total_pages\":0}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        tmdb.start();
    }

    @AfterEach void teardown() { tmdb.stop(0); }

    TmdbClient client(String token) { return new TmdbClient(mapper, token, "http://127.0.0.1:" + tmdb.getAddress().getPort()); }
    Titles titles(String token) { var client = client(token); return new Titles(db, mapper, client, new TitleSummaries(db), new StreamingAvailability(client)); }

    static String movie(long id, String title, String original) {
        return "{\"id\":" + id + ",\"title\":\"" + title + "\",\"original_title\":\"" + original + "\",\"release_date\":\"2010-01-01\",\"genre_ids\":[]}";
    }

    static String page(String... items) { return "{\"total_pages\":1,\"results\":[" + String.join(",", items) + "]}"; }

    @SuppressWarnings("unchecked")
    static List<String> names(Map<String, Object> result) {
        return ((List<Catalog.Title>) result.get("items")).stream().map(Catalog.Title::name).toList();
    }

    @Test void shouldCleanSpacesAndFoldAccentsAndCase() {
        assertEquals("cidade de deus", SearchTerms.clean("  cidade \t de\n   deus  "));
        assertEquals("acao total", SearchTerms.fold("  AÇÃO   Total "));
        assertEquals(List.of("o", "poderoso", "chefao"), SearchTerms.words("O Poderoso Chefão!"));
    }

    @Test void shouldScoreTyposAndPartialWords() {
        assertTrue(SearchTerms.similarity("narutto", "Naruto Shippuden") >= SearchTerms.MIN_SIMILARITY);
        assertTrue(SearchTerms.similarity("poderozo chefao", "O Poderoso Chefão") >= SearchTerms.MIN_SIMILARITY);
        assertTrue(SearchTerms.similarity("interestel", "Interestelar") >= SearchTerms.MIN_SIMILARITY, "começo de palavra conta");
        assertTrue(SearchTerms.similarity("matrix", "O Rei Leão") < SearchTerms.MIN_SIMILARITY);
        assertTrue(SearchTerms.similarity("spirited", "A Viagem de Chihiro", "Spirited Away") >= SearchTerms.MIN_SIMILARITY, "vale o nome original");
        assertEquals(0, SearchTerms.similarity("   ", "Matrix"));
        assertTrue(SearchTerms.similarity("matirx", "Matrix") >= SearchTerms.MIN_SIMILARITY, "letras invertidas contam como 1 erro");
        assertTrue(SearchTerms.similarity("seltonn melo", "Melo") < SearchTerms.MIN_SIMILARITY, "palavra curta certa não esconde a longa errada");
        assertTrue(SearchTerms.similarity("seltonn melo", "Selton Mello") >= SearchTerms.MIN_SIMILARITY);
    }

    @Test void shouldTryWholeWordsThenStartsThenTypoFixes() {
        assertEquals(List.of("poderozo", "chefao", "poder", "chef", "pod", "che"), SearchTerms.attempts("o poderozo chefao"));
        assertEquals(List.of("keanu", "reves", "kea", "rev"), SearchTerms.attempts("Keanu  Reves"));
        assertTrue(SearchTerms.attempts("brekin bad").containsAll(List.of("brekin", "bad", "brek")));
        var single = SearchTerms.attempts("narutto");
        assertFalse(single.contains("narutto"), "o termo original já foi tentado");
        assertTrue(single.indexOf("naruto") < single.indexOf("nar"), "letra dobrada vem antes do começo curto");
        assertTrue(SearchTerms.attempts("intersetelar").contains("interestelar"), "letras vizinhas trocadas");
        assertTrue(SearchTerms.attempts("de do o").isEmpty(), "palavras comuns sozinhas não viram consulta");
        assertTrue(SearchTerms.attempts("x".repeat(14) + "yz").size() <= SearchTerms.MAX_ATTEMPTS);
    }

    @Test void shouldStopAtTheFirstAttemptThatFindsSomethingClose() {
        answers.put("/search/movie|chefao", page(movie(238, "O Poderoso Chefão", "The Godfather")));
        var result = titles("fake").titles("o poderozo chefao", "movie", 1);
        assertEquals(List.of("O Poderoso Chefão"), names(result));
        assertEquals(true, result.get("approximate"));
        assertEquals("/search/movie|o poderozo chefao", searched.getFirst());
        assertTrue(searched.contains("/search/movie|chefao"));
        assertTrue(searched.size() <= 1 + SearchTerms.BATCH, "parou na primeira rodada que achou: " + searched);
    }

    @Test void shouldFixSwappedLettersAndCacheTheAnswer() {
        answers.put("/search/movie|interestelar", page(movie(157336, "Interestelar", "Interstellar")));
        var titles = titles("fake");
        assertEquals(List.of("Interestelar"), names(titles.titles("intersetelar", "movie", 1)));
        int asked = searched.size();
        assertEquals(List.of("Interestelar"), names(titles.titles("  INTERSETELAR ", "movie", 1)));
        assertEquals(asked + 1, searched.size(), "na segunda vez só o termo exato vai ao TMDB; o resto vem do cache");
    }

    @Test void shouldSendTheCleanTermToTmdb() {
        answers.put("/search/movie|Cidade de Deus", page(movie(598, "Cidade de Deus", "Cidade de Deus")));
        var result = titles("fake").titles("   Cidade    de   Deus  ", "movie", 1);
        assertEquals(List.of("Cidade de Deus"), names(result));
        assertEquals(false, result.get("approximate"));
        assertEquals(List.of("/search/movie|Cidade de Deus"), searched, "espaços sobrando saem antes de ir ao TMDB");
    }

    @Test void shouldRetryWithoutAccentsWhenNothingIsFound() {
        answers.put("/search/movie|o poderoso chefao", page(movie(238, "O Poderoso Chefão", "The Godfather")));
        var result = titles("fake").titles("O PODEROSO CHEFÃO", "movie", 1);
        assertEquals(List.of("O Poderoso Chefão"), names(result));
        assertEquals(false, result.get("approximate"));
        assertEquals(List.of("/search/movie|O PODEROSO CHEFÃO", "/search/movie|o poderoso chefao"), searched);
    }

    @Test void shouldFindCloseNamesWhenTheTermHasATypo() {
        answers.put("/search/movie|narut", page(movie(1, "Naruto Shippuden: O Filme", "Naruto Shippuden"), movie(2, "Narutopia", "Narutopia"),
            movie(3, "Nada a Ver", "Nothing")));
        var result = titles("fake").titles("narutto", "movie", 1);
        assertEquals(List.of("Naruto Shippuden: O Filme"), names(result), "Narutopia (67% parecido) e Nada a Ver ficam de fora");
        assertEquals(true, result.get("approximate"));
        assertEquals(false, result.get("hasMore"));
    }

    @Test void shouldNotGuessOnLaterPages() {
        var result = titles("fake").titles("narutto", "movie", 2);
        assertTrue(names(result).isEmpty());
        assertEquals(List.of("/search/movie|narutto"), searched);
    }

    @Test void shouldToleratePeopleNamesWithTyposAndAccents() {
        answers.put("/search/person|melo", "{\"total_pages\":1,\"results\":[{\"id\":12,\"name\":\"Melo\"},{\"id\":13,\"name\":\"Eduardo Melo\"}]}");
        answers.put("/search/person|selto", "{\"total_pages\":1,\"results\":[{\"id\":10,\"name\":\"Selton Mello\"},{\"id\":11,\"name\":\"Sela Ward\"}]}");
        @SuppressWarnings("unchecked")
        var people = (List<People.PersonResult>) new People(client("fake")).search("seltonn   melo", 1).get("items");
        assertEquals(List.of("Selton Mello"), people.stream().map(People.PersonResult::name).toList());
    }

    @Test void shouldApplyTheSameRulesInDemoMode() {
        var demo = titles("");
        assertEquals(List.of("Maré Alta"), names(demo.titles("  MARE   alta ", "all", 1)));
        var typo = demo.titles("mare alts", "all", 1);
        assertEquals(List.of("Maré Alta"), names(typo));
        assertEquals(true, typo.get("approximate"));
    }
}
