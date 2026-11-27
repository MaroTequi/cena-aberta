package br.com.cenaaberta;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.StreamSupport;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Trailer de um filme ou série, escolhido entre os vídeos do YouTube que o TMDB lista para a obra.
 * O vídeo continua no YouTube; o catálogo só devolve o identificador para o player oficial.
 * As respostas ficam em memória por 12 horas.
 */
@RestController
public class Trailers {

    /**
     * Versão de um trailer.
     * @param key identificador do vídeo no YouTube
     * @param name título do vídeo no YouTube
     * @param version "dubbed" (dublado no Brasil), "portuguese" (em português do Brasil, sem dizer se é dublado ou
     *     legendado, comum em produção brasileira), "subtitled" (legendado no Brasil), "original" (outro idioma)
     *     ou "portugal" (versão de Portugal, dublada ou não)
     */
    record Version(String key, String name, String version) {}

    /**
     * Trailer escolhido e as outras versões disponíveis.
     * @param key identificador do vídeo no YouTube (null quando a obra não tem trailer)
     * @param name título do vídeo no YouTube
     * @param language idioma informado pelo TMDB (ex.: "pt", "en")
     * @param version versão do trailer escolhido (ver {@link Version})
     * @param versions melhor vídeo de cada versão, na ordem de preferência; o primeiro é o escolhido
     */
    record Trailer(String key, String name, String language, String version, List<Version> versions) {
        static final Trailer NONE = new Trailer(null, null, null, null, List.of());
    }

    private record Cached(Trailer value, long expires) {
        boolean fresh() { return System.currentTimeMillis() < expires; }
    }

    /** Tipos de vídeo do TMDB aceitos como trailer. */
    private static final Set<String> TYPES = Set.of("Trailer", "Teaser");
    private static final Pattern YOUTUBE_KEY = Pattern.compile("[A-Za-z0-9_-]{11}");
    private static final long TTL = Duration.ofHours(12).toMillis();
    private static final int MAX_CACHED = 5000;

    private final TmdbClient tmdb;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    Trailers(TmdbClient tmdb) { this.tmdb = tmdb; }

    /** Trailer de um filme ou série ({@code tmdb-movie-N} / {@code tmdb-tv-N}); obra demo não tem trailer. */
    @GetMapping("/titles/{id}/trailer")
    Trailer trailer(@PathVariable String id) {
        if (id.matches("demo-[a-z0-9-]+")) return Trailer.NONE;
        if (!id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (tmdb.demo()) return Trailer.NONE;
        var cached = cache.get(id);
        if (cached != null && cached.fresh()) return cached.value();
        String[] parts = id.split("-");
        var found = best(tmdb.remote("/" + parts[1] + "/" + parts[2] + "/videos?include_video_language=pt,en,null").path("results"));
        if (cache.size() >= MAX_CACHED) cache.values().removeIf(entry -> !entry.fresh());
        if (cache.size() >= MAX_CACHED) {
            // Sem vencidos para tirar: sai a metade que vence primeiro, não o cache inteiro.
            long cutoff = cache.values().stream().mapToLong(Cached::expires).sorted().skip(MAX_CACHED / 2).findFirst().orElse(Long.MAX_VALUE);
            cache.values().removeIf(entry -> entry.expires() < cutoff);
        }
        cache.put(id, new Cached(found, System.currentTimeMillis() + TTL));
        return found;
    }

    /**
     * Versões em ordem de preferência: dublado no Brasil vem sempre primeiro; a versão de Portugal fica por último,
     * depois do original, porque a dublagem de lá (com outros nomes de personagem) soa estranha para quem é do Brasil.
     */
    static final List<String> VERSIONS = List.of("dubbed", "portuguese", "subtitled", "original", "portugal");
    private static final Pattern DUBBED = Pattern.compile("(?iu)dublad|\\bdub\\b");
    private static final Pattern SUBTITLED = Pattern.compile("(?iu)legendad|\\bleg\\b");

    /**
     * Escolhe o trailer: só YouTube, só trailer ou teaser. A versão manda primeiro (dublado no Brasil,
     * português do Brasil, legendado no Brasil, original, Portugal); dentro da mesma versão vale inglês antes de
     * outros idiomas, trailer antes de teaser, oficial antes de não oficial e o mais recente.
     */
    static Trailer best(JsonNode videos) {
        var ranked = StreamSupport.stream(videos.spliterator(), false)
            .filter(v -> "YouTube".equals(v.path("site").asText()) && YOUTUBE_KEY.matcher(v.path("key").asText()).matches())
            .filter(v -> TYPES.contains(v.path("type").asText()))
            .sorted(Comparator.comparingInt((JsonNode v) -> VERSIONS.indexOf(version(v)))
                .thenComparingInt(Trailers::regionRank)
                .thenComparing(v -> "Trailer".equals(v.path("type").asText()) ? 0 : 1)
                .thenComparing(v -> v.path("official").asBoolean() ? 0 : 1)
                .thenComparing(v -> v.path("published_at").asText(""), Comparator.reverseOrder()))
            .toList();
        if (ranked.isEmpty()) return Trailer.NONE;
        var versions = new ArrayList<Version>();
        for (var video : ranked) {
            String version = version(video);
            if (versions.stream().noneMatch(v -> v.version().equals(version)))
                versions.add(new Version(video.path("key").asText(), name(video), version));
        }
        var chosen = ranked.getFirst();
        return new Trailer(chosen.path("key").asText(), name(chosen), chosen.path("iso_639_1").asText(null), version(chosen), List.copyOf(versions));
    }

    /** Versão de um vídeo pelo idioma e país do TMDB e pelo título ("Dublado", "Legendado"). */
    static String version(JsonNode video) {
        if (!"pt".equals(video.path("iso_639_1").asText())) return "original";
        if ("PT".equals(video.path("iso_3166_1").asText())) return "portugal";
        String name = video.path("name").asText("");
        if (DUBBED.matcher(name).find()) return "dubbed";
        if (SUBTITLED.matcher(name).find()) return "subtitled";
        return "portuguese";
    }

    private static int regionRank(JsonNode video) {
        String language = video.path("iso_639_1").asText("");
        return language.equals("pt") || language.equals("en") ? 0 : 1;
    }

    private static String name(JsonNode video) {
        String name = video.path("name").asText("").strip();
        return name.isEmpty() ? "Trailer" : name.length() > 120 ? name.substring(0, 120) : name;
    }
}
