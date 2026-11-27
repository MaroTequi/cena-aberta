package br.com.cenaaberta;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/** Onde assistir: leitura da disponibilidade no TMDB falso, modo demo e filtro por serviços assinados. */
class StreamingAvailabilityTest {

    static final String NETFLIX = "{\"provider_id\":8,\"provider_name\":\"Netflix\",\"logo_path\":\"/netflix.jpg\",\"display_priority\":1}";
    static final String PLUTO = "{\"provider_id\":300,\"provider_name\":\"Pluto TV\",\"logo_path\":\"/pluto.jpg\"}";
    static final String STORE = "{\"provider_id\":2,\"provider_name\":\"Apple TV\",\"logo_path\":\"../etc/passwd\"}";

    HttpServer tmdb;
    final Map<String, String> bodies = new ConcurrentHashMap<>();
    final List<String> requests = new CopyOnWriteArrayList<>();
    volatile int failWith;
    JdbcTemplate db;
    ObjectMapper mapper = new ObjectMapper();

    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__catalog.sql"), new ClassPathResource("db/migration/V2__title_details.sql"),
            new ClassPathResource("db/migration/V3__title_genre_ids.sql")).execute(source);
        db = new JdbcTemplate(source);
        tmdb = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        tmdb.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            requests.add(exchange.getRequestURI().toString());
            String body = bodies.get(path);
            int status = failWith != 0 ? failWith : body == null ? 404 : 200;
            byte[] bytes = (body == null ? "{}" : body).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        tmdb.start();
    }

    @AfterEach void teardown() { tmdb.stop(0); }

    TmdbClient client(String token) { return new TmdbClient(mapper, token, "http://127.0.0.1:" + tmdb.getAddress().getPort()); }
    StreamingAvailability remote() { return new StreamingAvailability(client("fake")); }
    StreamingAvailability demo() { return new StreamingAvailability(client("")); }

    static List<Integer> ids(List<StreamingAvailability.Provider> providers) { return providers.stream().map(StreamingAvailability.Provider::id).toList(); }

    @Test void shouldReadBrazilianAvailabilityGroupedByKind() {
        bodies.put("/movie/603/watch/providers", "{\"results\":{\"US\":{\"flatrate\":[" + STORE + "]},\"BR\":{\"link\":\"https://www.themoviedb.org/movie/603/watch?locale=BR\","
            + "\"flatrate\":[" + NETFLIX + "," + NETFLIX + "],\"free\":[" + PLUTO + "],\"ads\":[" + PLUTO + "],\"rent\":[" + STORE + "],\"buy\":[" + STORE + "]}}}");
        var found = remote().of("tmdb-movie-603");
        assertEquals("https://www.themoviedb.org/movie/603/watch?locale=BR", found.link());
        assertEquals(List.of(8), ids(found.stream()));
        assertEquals(List.of(300), ids(found.free()));
        assertEquals(List.of(2), ids(found.rent()));
        assertEquals(List.of(2), ids(found.buy()));
        assertEquals("https://image.tmdb.org/t/p/w92/netflix.jpg", found.stream().getFirst().logo());
        assertNull(found.rent().getFirst().logo(), "caminho de logo fora do padrão não vira URL");
    }

    @Test void shouldReturnEmptyAvailabilityWhenBrazilHasNoOffer() {
        bodies.put("/tv/1399/watch/providers", "{\"results\":{\"US\":{\"link\":\"https://www.themoviedb.org/tv/1399/watch\",\"flatrate\":[" + NETFLIX + "]}}}");
        var found = remote().of("tmdb-tv-1399");
        assertNull(found.link());
        assertTrue(found.stream().isEmpty() && found.free().isEmpty() && found.rent().isEmpty() && found.buy().isEmpty());
    }

    @Test void shouldNotTrustLinkOutsideTmdb() {
        bodies.put("/movie/7/watch/providers", "{\"results\":{\"BR\":{\"link\":\"https://example.com/phishing\",\"flatrate\":[" + NETFLIX + "]}}}");
        assertNull(remote().of("tmdb-movie-7").link());
    }

    @Test void shouldCacheAvailabilityBetweenCalls() {
        bodies.put("/movie/603/watch/providers", "{\"results\":{\"BR\":{\"flatrate\":[" + NETFLIX + "]}}}");
        var availability = remote();
        availability.of("tmdb-movie-603");
        availability.of("tmdb-movie-603");
        assertEquals(1, requests.size());
    }

    @Test void shouldRejectUnknownIdsAndPropagateTmdbFailures() {
        var availability = remote();
        for (String id : List.of("demo-nao-existe", "season-tmdb-tv-1-s1", "tmdb-movie-0", "tmdb-person-1", "x"))
            assertEquals(404, assertThrows(ResponseStatusException.class, () -> availability.of(id)).getStatusCode().value(), id);
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> availability.of("tmdb-movie-999")).getStatusCode().value());
        failWith = 429;
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> availability.of("tmdb-movie-998")).getStatusCode().value());
    }

    @Test void shouldServeFictionalProvidersInDemoMode() {
        var availability = demo();
        assertEquals(List.of(9001, 9002, 9003), ids(availability.providers()));
        assertEquals(List.of(9001), ids(availability.of("demo-ultimo-rolo").stream()));
        assertEquals(List.of(9002), ids(availability.of("demo-mare-alta").stream()));
        assertTrue(availability.of("tmdb-movie-603").stream().isEmpty(), "sem token não há consulta externa");
        assertTrue(requests.isEmpty());
    }

    @Test void shouldListBrazilianProvidersOnceInPriorityOrder() {
        bodies.put("/watch/providers/movie", "{\"results\":[{\"provider_id\":300,\"provider_name\":\"Pluto TV\",\"logo_path\":\"/pluto.jpg\",\"display_priorities\":{\"BR\":9}},"
            + "{\"provider_id\":8,\"provider_name\":\"Netflix\",\"logo_path\":\"/netflix.jpg\",\"display_priorities\":{\"BR\":1}}]}");
        bodies.put("/watch/providers/tv", "{\"results\":[{\"provider_id\":8,\"provider_name\":\"Netflix\",\"logo_path\":\"/netflix.jpg\",\"display_priorities\":{\"BR\":0}},"
            + "{\"provider_id\":0,\"provider_name\":\"Inválido\"},{\"provider_id\":119,\"provider_name\":\"Prime Video\",\"logo_path\":\"/prime.jpg\",\"display_priorities\":{\"BR\":2}}]}");
        var availability = remote();
        assertEquals(List.of(8, 119, 300), ids(availability.providers()));
        assertEquals(List.of(8, 119, 300), ids(availability.providers()));
        assertEquals(2, requests.size(), "a lista de serviços fica em cache");
        assertTrue(requests.stream().allMatch(uri -> uri.contains("watch_region=BR")));
    }

    @Test void shouldKeepOnlyTitlesIncludedInSubscribedServices() {
        bodies.put("/movie/1/watch/providers", "{\"results\":{\"BR\":{\"flatrate\":[" + NETFLIX + "]}}}");
        bodies.put("/movie/2/watch/providers", "{\"results\":{\"BR\":{\"rent\":[" + NETFLIX + "]}}}");
        bodies.put("/movie/3/watch/providers", "{\"results\":{\"BR\":{\"ads\":[" + PLUTO + "]}}}");
        var titles = new ArrayList<Catalog.Title>();
        for (int n = 1; n <= 4; n++) titles.add(new Catalog.Title("tmdb-movie-" + n, "movie", false, "Filme " + n, "Filme " + n, "2024", "", null));
        var availability = remote();
        assertEquals(List.of("tmdb-movie-1"), availability.onlyIncludedIn(titles, Set.of(8)).stream().map(Catalog.Title::id).toList(),
            "aluguel não conta como assinatura e obra desconhecida (404) sai");
        assertEquals(List.of("tmdb-movie-1", "tmdb-movie-3"), availability.onlyIncludedIn(titles, Set.of(8, 300)).stream().map(Catalog.Title::id).toList());
        failWith = 500;
        var outage = new StreamingAvailability(client("fake"));
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> outage.onlyIncludedIn(titles, Set.of(8))).getStatusCode().value());
    }

    @Test void shouldStopAskingTmdbAfterTheFirstFailure() {
        failWith = 429;
        var titles = new ArrayList<Catalog.Title>();
        for (int n = 1; n <= 30; n++) titles.add(new Catalog.Title("tmdb-movie-" + n, "movie", false, "Filme " + n, "Filme " + n, "2024", "", null));
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> remote().onlyIncludedIn(titles, Set.of(8))).getStatusCode().value());
        assertTrue(requests.size() < 30, "consultas pendentes são canceladas na primeira falha: " + requests.size());
    }

    @Test void shouldKeepTheLastProviderListWhenTmdbFails() throws Exception {
        bodies.put("/watch/providers/movie", "{\"results\":[{\"provider_id\":8,\"provider_name\":\"Netflix\",\"display_priorities\":{\"BR\":1}}]}");
        bodies.put("/watch/providers/tv", "{\"results\":[]}");
        var availability = remote();
        assertEquals(List.of(8), ids(availability.providers()));
        var field = StreamingAvailability.class.getDeclaredField("services");
        field.setAccessible(true);
        var cached = field.get(availability);
        var expired = cached.getClass().getDeclaredConstructors()[0];
        expired.setAccessible(true);
        field.set(availability, expired.newInstance(List.of(new StreamingAvailability.Provider(8, "Netflix", null)), 0L));
        failWith = 503;
        assertEquals(List.of(8), ids(availability.providers()), "lista vencida serve de reserva quando o TMDB cai");
        var cold = remote();
        assertEquals(503, assertThrows(ResponseStatusException.class, cold::providers).getStatusCode().value(), "sem lista anterior, a falha aparece");
    }

    @Test void shouldAcceptTheUnionOfEightPeoplesServices() {
        var client = client("");
        var titles = new Titles(db, mapper, client, new TitleSummaries(db), new StreamingAvailability(client));
        var many = new ArrayList<Integer>();
        for (int n = 1; n <= 480; n++) many.add(n);
        assertTrue(titles.batch(List.of("demo-mare-alta"), 0, null, false, many).isEmpty());
        var tooMany = new ArrayList<>(many);
        for (int n = 481; n <= 501; n++) tooMany.add(n);
        assertEquals(400, assertThrows(ResponseStatusException.class,
            () -> titles.batch(List.of("demo-mare-alta"), 0, null, false, tooMany)).getStatusCode().value());
    }

    @Test void shouldFilterTitleBatchByProviders() {
        var client = client("");
        var titles = new Titles(db, mapper, client, new TitleSummaries(db), new StreamingAvailability(client));
        var all = List.of("demo-ultimo-rolo", "demo-mare-alta", "demo-lua-de-papel");
        assertEquals(3, titles.batch(all, 0, null, false, null).size());
        assertEquals(3, titles.batch(all, 0, null, false, List.of()).size());
        assertEquals(List.of("demo-mare-alta"), titles.batch(all, 0, null, false, List.of(9002)).stream().map(Catalog.Title::id).toList());
        assertEquals(400, assertThrows(ResponseStatusException.class,
            () -> titles.batch(all, 0, null, false, java.util.stream.IntStream.rangeClosed(1, 501).boxed().toList())).getStatusCode().value());
    }

    @Test void shouldAskTmdbOnlyForSubscribedServicesInRoomSuggestions() {
        bodies.put("/discover/movie", "{\"results\":[]}");
        var client = client("fake");
        var suggestions = new RoomSuggestions(db, mapper, client, new TitleSummaries(db));
        suggestions.suggestions(new RoomSuggestions.Suggestions(List.of(), List.of(), List.of(), 1, null, null, "movie", List.of(119, 8, 8)));
        assertFalse(requests.isEmpty());
        assertTrue(requests.stream().allMatch(uri -> uri.contains("watch_region=BR") && uri.contains("with_watch_providers=8%7C119")
            && uri.contains("with_watch_monetization_types=flatrate%7Cfree%7Cads")), requests.toString());
        requests.clear();
        suggestions.suggestions(new RoomSuggestions.Suggestions(List.of(), List.of(), List.of(), 1, null, null, "movie"));
        assertTrue(requests.stream().noneMatch(uri -> uri.contains("with_watch_providers")), "sem filtro, a consulta fica como antes");
    }

    @Test void shouldFilterDemoRoomSuggestionsAndRejectInvalidProviders() {
        var client = client("");
        var suggestions = new RoomSuggestions(db, mapper, client, new TitleSummaries(db));
        @SuppressWarnings("unchecked")
        var items = (List<Catalog.Title>) suggestions.suggestions(
            new RoomSuggestions.Suggestions(List.of(), List.of(), List.of(), 1, null, null, "all", List.of(9001))).get("items");
        assertEquals(List.of("demo-ultimo-rolo", "demo-neon-norte"), items.stream().map(Catalog.Title::id).toList());
        for (var invalid : List.of(Arrays.asList(8, null), List.of(0), Collections.nCopies(1, -3)))
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> suggestions.suggestions(
                new RoomSuggestions.Suggestions(List.of(), List.of(), List.of(), 1, null, null, "all", invalid))).getStatusCode().value());
    }
}
