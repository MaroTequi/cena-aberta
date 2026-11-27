package br.com.cenaaberta;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/** Busca de pessoas: leitura do TMDB falso, validação do termo e modo demo. */
class PeopleSearchTest {

    HttpServer tmdb;
    volatile String body = "{\"results\":[],\"total_pages\":0}";
    final List<String> requests = new CopyOnWriteArrayList<>();
    final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach void setup() throws Exception {
        tmdb = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        tmdb.createContext("/", exchange -> {
            requests.add(exchange.getRequestURI().toString());
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        tmdb.start();
    }

    @AfterEach void teardown() { tmdb.stop(0); }

    People people(String token) { return new People(new TmdbClient(mapper, token, "http://127.0.0.1:" + tmdb.getAddress().getPort())); }

    @SuppressWarnings("unchecked")
    static List<People.PersonResult> items(Map<String, Object> page) { return (List<People.PersonResult>) page.get("items"); }

    @Test void shouldReadPeopleWithDepartmentPhotoAndKnownWorks() {
        body = "{\"total_pages\":3,\"results\":["
            + "{\"id\":6384,\"name\":\"Keanu Reeves\",\"profile_path\":\"/keanu.jpg\",\"known_for_department\":\"Acting\",\"known_for\":["
            + "{\"media_type\":\"movie\",\"title\":\"Matrix\"},{\"media_type\":\"tv\",\"name\":\"Swedish Dicks\"},"
            + "{\"media_type\":\"movie\",\"title\":\"John Wick\"},{\"media_type\":\"movie\",\"title\":\"Speed\"}]},"
            + "{\"id\":0,\"name\":\"Sem id\"},{\"id\":7,\"name\":\"\"},{\"id\":8,\"name\":\"Adulto\",\"adult\":true}]}";
        var page = people("fake").search("  Keanu  ", 2);
        var found = items(page);
        assertEquals(1, found.size(), "sem id, sem nome e conteúdo adulto ficam de fora");
        var keanu = found.getFirst();
        assertEquals(6384, keanu.id());
        assertEquals("Acting", keanu.department());
        assertEquals(List.of("Matrix", "Swedish Dicks", "John Wick"), keanu.knownFor());
        assertTrue(keanu.photo().endsWith("/keanu.jpg"), keanu.photo());
        assertEquals(true, page.get("hasMore"));
        assertTrue(requests.getFirst().startsWith("/search/person?query=Keanu&page=2&include_adult=false"), requests.getFirst());
    }

    @Test void shouldSayThereIsNoMoreOnTheLastPage() {
        body = "{\"total_pages\":1,\"results\":[{\"id\":1,\"name\":\"Ana\"}]}";
        assertEquals(false, people("fake").search("Ana", 1).get("hasMore"));
    }

    @Test void shouldRejectShortLongAndOutOfRangeSearches() {
        var people = people("fake");
        for (var args : List.of(new Object[] {"a", 1}, new Object[] {" ", 1}, new Object[] {"x".repeat(101), 1}, new Object[] {"Ana", 0}, new Object[] {"Ana", 501})) {
            var error = assertThrows(ResponseStatusException.class, () -> people.search((String) args[0], (int) args[1]));
            assertEquals(400, error.getStatusCode().value());
        }
        assertTrue(requests.isEmpty());
    }

    @Test void shouldReturnNoPeopleInDemoMode() {
        var page = people("").search("Keanu", 1);
        assertTrue(items(page).isEmpty());
        assertEquals(true, page.get("demo"));
        assertTrue(requests.isEmpty());
    }
}
