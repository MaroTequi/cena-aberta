package br.com.cenaaberta;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/** Trailers: escolha do vídeo entre os listados pelo TMDB falso, cache e modo demo. */
class TrailersTest {

    HttpServer tmdb;
    final Map<String, String> bodies = new ConcurrentHashMap<>();
    final List<String> requests = new CopyOnWriteArrayList<>();
    volatile int failWith;
    final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach void setup() throws Exception {
        tmdb = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        tmdb.createContext("/", exchange -> {
            requests.add(exchange.getRequestURI().toString());
            String body = bodies.get(exchange.getRequestURI().getPath());
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

    Trailers trailers(String token) { return new Trailers(new TmdbClient(mapper, token, "http://127.0.0.1:" + tmdb.getAddress().getPort())); }

    static String video(String key, String type, String language, String country, boolean official, String published) {
        return "{\"site\":\"YouTube\",\"key\":\"" + key + "\",\"type\":\"" + type + "\",\"name\":\"Vídeo " + key + "\",\"iso_639_1\":\"" + language
            + "\",\"iso_3166_1\":\"" + country + "\",\"official\":" + official + ",\"published_at\":\"" + published + "\"}";
    }

    Trailers.Trailer best(String... videos) {
        try { return Trailers.best(mapper.readTree("[" + String.join(",", videos) + "]")); }
        catch (Exception invalid) { throw new IllegalStateException(invalid); }
    }

    static String named(String key, String name, String type, String language, String country, String published) {
        return "{\"site\":\"YouTube\",\"key\":\"" + key + "\",\"type\":\"" + type + "\",\"name\":\"" + name + "\",\"iso_639_1\":\"" + language
            + "\",\"iso_3166_1\":\"" + country + "\",\"official\":true,\"published_at\":\"" + published + "\"}";
    }

    @Test void shouldAlwaysPreferTheBrazilianDubbedTrailer() {
        var found = best(named("legendado01", "Trailer Oficial Legendado", "Trailer", "pt", "BR", "2025-01-01"),
            named("original001", "Official Trailer", "Trailer", "en", "US", "2025-02-01"),
            named("nacional001", "Trailer", "Trailer", "pt", "BR", "2025-03-01"),
            named("dubladoOld1", "Teaser Dublado", "Teaser", "pt", "BR", "2020-01-01"));
        assertEquals("dubladoOld1", found.key(), "dublado vence mesmo sendo teaser e mais antigo");
        assertEquals("dubbed", found.version());
        assertEquals(List.of("dubbed", "portuguese", "subtitled", "original"), found.versions().stream().map(Trailers.Version::version).toList());
        assertEquals(List.of("dubladoOld1", "nacional001", "legendado01", "original001"), found.versions().stream().map(Trailers.Version::key).toList());
    }

    @Test void shouldPutPortugalAfterTheOriginalAndNeverCallItDubbed() {
        var found = best(named("dobradoPT01", "Trailer Oficial Dobrado (Universal Pictures Portugal)", "Trailer", "pt", "PT", "2025-01-01"),
            named("original001", "Official Trailer", "Trailer", "en", "US", "2020-01-01"));
        assertEquals("original001", found.key());
        assertEquals(List.of("original", "portugal"), found.versions().stream().map(Trailers.Version::version).toList());
        var onlyPortugal = best(named("dobradoPT01", "Trailer Oficial Dobrado", "Trailer", "pt", "PT", "2025-01-01"));
        assertEquals("portugal", onlyPortugal.version(), "sem outra opção, a versão de Portugal ainda aparece");
    }

    @Test void shouldKeepOneEntryPerVersion() {
        var found = best(named("dubladoBR01", "TRAILER DUBLADO", "Trailer", "pt", "BR", "2020-01-01"),
            named("dubladoBR02", "Teaser dublado", "Teaser", "pt", "BR", "2025-01-01"));
        assertEquals("dubladoBR01", found.key());
        assertEquals(1, found.versions().size());
    }

    @Test void shouldClassifyVersionByLanguageAndTitle() throws Exception {
        assertEquals("dubbed", Trailers.version(mapper.readTree(named("a0000000001", "Trailer Oficial Dublado", "Trailer", "pt", "BR", ""))));
        assertEquals("dubbed", Trailers.version(mapper.readTree(named("a0000000001", "Trailer Dub", "Trailer", "pt", "BR", ""))));
        assertEquals("subtitled", Trailers.version(mapper.readTree(named("a0000000001", "Trailer legendado", "Trailer", "pt", "BR", ""))));
        assertEquals("portuguese", Trailers.version(mapper.readTree(named("a0000000001", "Trailer oficial", "Trailer", "pt", "BR", ""))));
        assertEquals("original", Trailers.version(mapper.readTree(named("a0000000001", "Dubbed trailer", "Trailer", "en", "US", ""))));
        assertEquals("portugal", Trailers.version(mapper.readTree(named("a0000000001", "Trailer Dobrado", "Trailer", "pt", "PT", ""))));
        assertEquals("portuguese", Trailers.version(mapper.readTree(named("a0000000001", "Dublin story", "Trailer", "pt", "BR", ""))), "\"dub\" só conta como palavra");
    }

    @Test void shouldPreferBrazilianPortugueseThenPortugueseThenEnglish() {
        assertEquals("ptBRtrailer", best(video("enTrailer01", "Trailer", "en", "US", true, "2024-01-01"),
            video("ptPTtrailer", "Trailer", "pt", "PT", true, "2024-01-01"), video("ptBRtrailer", "Trailer", "pt", "BR", true, "2023-01-01")).key());
        assertEquals("enTrailer01", best(video("enTrailer01", "Trailer", "en", "US", true, "2024-01-01"),
            video("ptPTtrailer", "Trailer", "pt", "PT", false, "2020-01-01")).key(), "Portugal fica depois do original");
        assertEquals("enTrailer01", best(video("esTrailer01", "Trailer", "es", "ES", true, "2025-01-01"),
            video("enTrailer01", "Trailer", "en", "US", true, "2020-01-01")).key());
    }

    @Test void shouldPreferTrailerOverTeaserAndOfficialAndNewest() {
        assertEquals("trailerOld1", best(video("teaserNew01", "Teaser", "pt", "BR", true, "2025-01-01"),
            video("trailerOld1", "Trailer", "pt", "BR", false, "2020-01-01")).key());
        assertEquals("official001", best(video("fanMade0001", "Trailer", "en", "US", false, "2025-01-01"),
            video("official001", "Trailer", "en", "US", true, "2020-01-01")).key());
        assertEquals("newest00001", best(video("oldest00001", "Trailer", "en", "US", true, "2020-01-01"),
            video("newest00001", "Trailer", "en", "US", true, "2024-06-01")).key());
    }

    @Test void shouldIgnoreClipsOtherSitesAndInvalidKeys() {
        var vimeo = "{\"site\":\"Vimeo\",\"key\":\"abcdefghijk\",\"type\":\"Trailer\",\"iso_639_1\":\"pt\"}";
        var none = best(vimeo, video("clip0000001", "Clip", "pt", "BR", true, "2024-01-01"),
            video("bad/key<x>1", "Trailer", "pt", "BR", true, "2024-01-01"), video("short", "Trailer", "pt", "BR", true, "2024-01-01"));
        assertNull(none.key());
        assertEquals("teaserOnly1", best(video("teaserOnly1", "Teaser", "en", "US", true, "2024-01-01")).key(), "sem trailer, o teaser serve");
    }

    @Test void shouldAskTmdbForPortugueseAndEnglishVideosAndCacheTheAnswer() {
        bodies.put("/movie/603/videos", "{\"results\":[" + video("matrix00001", "Trailer", "pt", "BR", true, "2021-01-01") + "]}");
        var trailers = trailers("fake");
        var found = trailers.trailer("tmdb-movie-603");
        assertEquals("matrix00001", found.key());
        assertEquals("Vídeo matrix00001", found.name());
        assertEquals("pt", found.language());
        assertEquals("portuguese", found.version());
        assertEquals(found, trailers.trailer("tmdb-movie-603"));
        assertEquals(1, requests.size(), "a segunda consulta vem do cache");
        assertTrue(requests.getFirst().contains("include_video_language=pt,en,null"), requests.getFirst());
    }

    @Test void shouldReturnNoTrailerWhenTmdbListsNone() {
        bodies.put("/tv/1399/videos", "{\"results\":[]}");
        assertEquals(Trailers.Trailer.NONE, trailers("fake").trailer("tmdb-tv-1399"));
    }

    @Test void shouldReturnNoTrailerForDemoTitlesAndDemoMode() {
        assertEquals(Trailers.Trailer.NONE, trailers("fake").trailer("demo-mare-alta"));
        assertEquals(Trailers.Trailer.NONE, trailers("").trailer("tmdb-movie-603"));
        assertTrue(requests.isEmpty());
    }

    @Test void shouldRejectSeasonsAndUnknownIds() {
        var trailers = trailers("fake");
        for (String id : List.of("tmdb-tv-1399-s1", "tmdb-person-1", "tmdb-movie-0", "../movie/1")) {
            var error = assertThrows(ResponseStatusException.class, () -> trailers.trailer(id), id);
            assertEquals(404, error.getStatusCode().value());
        }
        assertTrue(requests.isEmpty());
    }

    @Test void shouldPassTmdbFailureAsServiceUnavailableWithoutCachingIt() {
        failWith = 503;
        var trailers = trailers("fake");
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> trailers.trailer("tmdb-movie-603")).getStatusCode().value());
        failWith = 0;
        bodies.put("/movie/603/videos", "{\"results\":[" + video("matrix00001", "Trailer", "en", "US", true, "2021-01-01") + "]}");
        assertEquals("matrix00001", trailers.trailer("tmdb-movie-603").key());
    }
}
