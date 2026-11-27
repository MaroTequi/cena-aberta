package br.com.cenaaberta;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Onde cada obra pode ser assistida no Brasil. O TMDB entrega esse dado a partir da JustWatch,
 * que exige crédito visível na tela. As respostas ficam em memória por 12 horas, porque a oferta
 * dos serviços muda no máximo uma vez por dia.
 */
@Component
class StreamingAvailability {

    /** País usado em todas as consultas de disponibilidade. */
    static final String REGION = "BR";

    /** Serviço de streaming, aluguel ou compra: id do TMDB, nome e logotipo (null no modo demo). */
    record Provider(int id, String name, String logo) {}

    /**
     * Disponibilidade de uma obra.
     * @param link página da obra no TMDB com os links de cada serviço (null quando não há)
     * @param stream serviços por assinatura
     * @param free serviços gratuitos, com ou sem anúncios
     * @param rent lojas de aluguel
     * @param buy lojas de compra
     */
    record Availability(String link, List<Provider> stream, List<Provider> free, List<Provider> rent, List<Provider> buy) {
        static final Availability NONE = new Availability(null, List.of(), List.of(), List.of(), List.of());

        /** Diz se a obra está incluída em algum dos serviços informados (assinatura ou gratuito). */
        boolean includedIn(Set<Integer> wanted) {
            return stream.stream().anyMatch(p -> wanted.contains(p.id())) || free.stream().anyMatch(p -> wanted.contains(p.id()));
        }
    }

    /** Serviços fictícios do modo demo, para a tela e os testes funcionarem sem TMDB_TOKEN. */
    static final List<Provider> DEMO_PROVIDERS = List.of(
        new Provider(9001, "Tela Livre", null), new Provider(9002, "Cine Casa", null), new Provider(9003, "Maratona+", null));

    /** Serviço fictício de cada obra demo, fixo por id para não mudar se a lista de obras mudar. */
    private static final Map<String, Integer> DEMO_OFFER = Map.of(
        "demo-ultimo-rolo", 9001, "demo-mare-alta", 9002, "demo-lua-de-papel", 9003,
        "demo-neon-norte", 9001, "demo-fim-da-linha", 9002, "demo-arquipelago", 9003);

    /** Teto de serviços aceitos num filtro: cobre a união dos participantes de uma sala. */
    static final int MAX_FILTER_PROVIDERS = 500;

    /** Consultas simultâneas ao TMDB para disponibilidade, somando todas as requisições do processo. */
    private static final Semaphore TMDB_SLOTS = new Semaphore(6);

    private record Cached<T>(T value, long expires) {
        boolean fresh() { return System.currentTimeMillis() < expires; }
    }

    private static final long TTL = Duration.ofHours(12).toMillis();
    private static final int MAX_CACHED_TITLES = 5000;

    private final TmdbClient tmdb;
    private final Map<String, Cached<Availability>> titles = new ConcurrentHashMap<>();
    private volatile Cached<List<Provider>> services;

    StreamingAvailability(TmdbClient tmdb) { this.tmdb = tmdb; }

    private JsonNode remote(String path) {
        try { TMDB_SLOTS.acquire(); }
        catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Consulta interrompida.");
        }
        try { return tmdb.remote(path); }
        finally { TMDB_SLOTS.release(); }
    }

    /**
     * Serviços de streaming disponíveis no Brasil (filmes e séries), na ordem de destaque do TMDB.
     * Se a atualização falhar, devolve a última lista conhecida em vez de deixar a tela vazia.
     */
    synchronized List<Provider> providers() {
        if (tmdb.demo()) return DEMO_PROVIDERS;
        var cached = services;
        if (cached != null && cached.fresh()) return cached.value();
        try { return refreshProviders(); }
        catch (ResponseStatusException failure) {
            if (cached != null) return cached.value();
            throw failure;
        }
    }

    private List<Provider> refreshProviders() {
        var priorities = new HashMap<Integer, Integer>();
        var found = new LinkedHashMap<Integer, Provider>();
        for (String format : List.of("movie", "tv")) {
            for (var item : remote("/watch/providers/" + format + "?watch_region=" + REGION).path("results")) {
                var provider = provider(item);
                if (provider == null) continue;
                found.putIfAbsent(provider.id(), provider);
                priorities.merge(provider.id(), item.path("display_priorities").path(REGION).asInt(Integer.MAX_VALUE), Math::min);
            }
        }
        var ordered = found.values().stream()
            .sorted(Comparator.comparingInt((Provider p) -> priorities.get(p.id())).thenComparing(Provider::name)).toList();
        services = new Cached<>(ordered, System.currentTimeMillis() + TTL);
        return ordered;
    }

    /**
     * Disponibilidade de um filme ou série.
     * @param id obra do modo demo ou {@code tmdb-movie-N} / {@code tmdb-tv-N}
     * @throws ResponseStatusException 404 quando a obra não existe; 503 quando o TMDB falha
     */
    Availability of(String id) {
        Integer demoOffer = DEMO_OFFER.get(id);
        if (demoOffer != null) {
            var provider = DEMO_PROVIDERS.stream().filter(p -> p.id() == demoOffer).findFirst().orElseThrow();
            return new Availability(null, List.of(provider), List.of(), List.of(), List.of());
        }
        if (!id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (tmdb.demo()) return Availability.NONE;
        var cached = titles.get(id);
        if (cached != null && cached.fresh()) return cached.value();
        String[] parts = id.split("-");
        JsonNode region = remote("/" + parts[1] + "/" + parts[2] + "/watch/providers").path("results").path(REGION);
        var free = new LinkedHashMap<Integer, Provider>();
        for (String kind : List.of("free", "ads")) for (var provider : list(region.path(kind))) free.putIfAbsent(provider.id(), provider);
        String link = region.path("link").asText("");
        var availability = new Availability(link.startsWith("https://www.themoviedb.org/") ? link : null,
            list(region.path("flatrate")), List.copyOf(free.values()), list(region.path("rent")), list(region.path("buy")));
        if (titles.size() >= MAX_CACHED_TITLES) titles.values().removeIf(entry -> !entry.fresh());
        if (titles.size() >= MAX_CACHED_TITLES) {
            // Sem vencidos para tirar: sai a metade que vence primeiro, não o cache inteiro.
            long cutoff = titles.values().stream().mapToLong(Cached::expires).sorted().skip(MAX_CACHED_TITLES / 2).findFirst().orElse(Long.MAX_VALUE);
            titles.values().removeIf(entry -> entry.expires() < cutoff);
        }
        titles.put(id, new Cached<>(availability, System.currentTimeMillis() + TTL));
        return availability;
    }

    /**
     * Mantém só as obras incluídas em algum dos serviços informados. Obra que o TMDB não conhece
     * mais (404) sai do resultado; falha do TMDB (503) é repassada, para a sala não começar vazia
     * por engano.
     */
    List<Catalog.Title> onlyIncludedIn(List<Catalog.Title> candidates, Set<Integer> wanted) {
        var kept = new ArrayList<Catalog.Title>();
        var executor = Executors.newFixedThreadPool(6);
        List<Future<Boolean>> tasks = List.of();
        try {
            tasks = candidates.stream().map(title -> executor.submit(() -> included(title.id(), wanted))).toList();
            for (int i = 0; i < tasks.size(); i++) {
                try { if (tasks.get(i).get()) kept.add(candidates.get(i)); }
                catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Consulta interrompida.");
                }
                catch (ExecutionException failure) {
                    if (failure.getCause() instanceof ResponseStatusException status) throw status;
                    throw new IllegalStateException(failure.getCause());
                }
            }
            return kept;
        } finally {
            // Na primeira falha, as consultas que ainda não começaram são canceladas.
            tasks.forEach(task -> task.cancel(true));
            executor.shutdownNow();
        }
    }

    private boolean included(String id, Set<Integer> wanted) {
        try { return of(id).includedIn(wanted); }
        catch (ResponseStatusException failure) {
            if (failure.getStatusCode().value() == 404) return false;
            throw failure;
        }
    }

    /** Serviços fictícios em que uma obra demo está; usado pelas sugestões das salas no modo demo. */
    static boolean demoIncludedIn(String id, Set<Integer> wanted) {
        Integer offer = DEMO_OFFER.get(id);
        return offer != null && wanted.contains(offer);
    }

    private static List<Provider> list(JsonNode items) {
        var result = new ArrayList<Provider>();
        for (var item : items) {
            var provider = provider(item);
            if (provider != null && result.stream().noneMatch(p -> p.id() == provider.id())) result.add(provider);
        }
        return List.copyOf(result);
    }

    private static Provider provider(JsonNode item) {
        int id = item.path("provider_id").asInt();
        String name = item.path("provider_name").asText("").strip();
        if (id <= 0 || name.isEmpty() || name.length() > 80) return null;
        return new Provider(id, name, TmdbMapper.imageUrl(item, "logo_path", "w92"));
    }
}
