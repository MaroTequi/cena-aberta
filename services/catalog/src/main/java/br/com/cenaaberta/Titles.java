package br.com.cenaaberta;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

import com.fasterxml.jackson.databind.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import static br.com.cenaaberta.DemoTitles.*;
import static br.com.cenaaberta.Genres.*;
import static br.com.cenaaberta.TmdbMapper.*;

/**
 * Obras: busca, detalhe (com cache no banco), temporadas, episódios e consulta em lote.
 * Detalhe, temporadas e episódios ficam juntos porque se chamam mutuamente (o detalhe de um
 * episódio lê os episódios da temporada, que por sua vez conferem o detalhe da série).
 */
@RestController
public class Titles {

    private final JdbcTemplate db;

    private final ObjectMapper mapper;

    private final TmdbClient tmdb;

    private final TitleSummaries summaries;

    private final StreamingAvailability availability;

    Titles(JdbcTemplate db, ObjectMapper mapper, TmdbClient tmdb, TitleSummaries summaries, StreamingAvailability availability) {
        this.db = db; this.mapper = mapper; this.tmdb = tmdb; this.summaries = summaries; this.availability = availability;
    }

    /**
     * Lista ou busca obras. A busca tolera espaços repetidos, maiúsculas, acentos e erros de digitação: tenta o termo
     * limpo, depois sem acentos e, se nada aparecer, procura pelo começo das palavras e fica só com os nomes parecidos.
     * Nesse último caso a resposta traz {@code approximate=true} e não tem próxima página.
     */
    @GetMapping("/titles")
    Map<String,Object> titles(@RequestParam(defaultValue="") String query, @RequestParam(defaultValue="all") String type,
                              @RequestParam(defaultValue="1") int page) {
        if (page < 1 || page > 500 || query.length() > 100 || !Set.of("all","movie","tv","anime").contains(type))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String term = SearchTerms.clean(query);
        if (tmdb.demo()) {
            var kind = FIXTURES.stream().filter(t -> type.equals("all") || type.equals(t.format()) || type.equals("anime") && t.anime()).toList();
            String folded = SearchTerms.fold(term);
            var found = kind.stream().filter(t -> SearchTerms.fold(t.name()).contains(folded) || SearchTerms.fold(t.original()).contains(folded)).toList();
            boolean approximate = false;
            if (found.isEmpty() && !folded.isEmpty()) {
                found = closest(kind, term);
                approximate = !found.isEmpty();
            }
            return Map.of("items",page == 1 ? found : List.of(),"hasMore",false,"demo",true,"approximate",approximate);
        }
        if (term.isEmpty()) {
            var listed = remote(type, "", page);
            return Map.of("items",listed.titles(),"hasMore",listed.more(),"demo",false,"approximate",false);
        }
        var found = remote(type, term, page);
        String folded = SearchTerms.fold(term);
        if (page == 1 && found.titles().isEmpty() && !folded.equals(term.toLowerCase(java.util.Locale.ROOT))) found = remote(type, folded, 1);
        if (page > 1 || !found.titles().isEmpty())
            return Map.of("items",found.titles(),"hasMore",found.more(),"demo",false,"approximate",false);
        String key = type + "|" + folded;
        var cached = approximateCache.get(key);
        if (cached != null && cached.getKey() > System.currentTimeMillis()) return cached.getValue();
        var close = SearchTerms.firstClose(SearchTerms.attempts(term), attempt -> remote(type, attempt, 1).titles(),
            candidates -> closest(distinct(candidates), term));
        Map<String,Object> answer = Map.of("items",close,"hasMore",false,"demo",false,"approximate",!close.isEmpty());
        if (approximateCache.size() >= 500) approximateCache.clear();
        approximateCache.put(key, Map.entry(System.currentTimeMillis() + APPROXIMATE_TTL, answer));
        return answer;
    }

    /** Resultado das buscas aproximadas por 10 minutos, para o mesmo erro de digitação não refazer as consultas. */
    private static final long APPROXIMATE_TTL = java.time.Duration.ofMinutes(10).toMillis();
    private final Map<String,Map.Entry<Long,Map<String,Object>>> approximateCache = new java.util.concurrent.ConcurrentHashMap<>();

    /** Página de obras do TMDB: busca pelo termo ou, sem termo, as mais populares. */
    private record Found(List<Catalog.Title> titles, boolean more) {}

    private Found remote(String type, String term, int page) {
        List<Catalog.Title> found = new ArrayList<>();
        boolean more = false;
        for (String format : type.equals("movie") || type.equals("tv") ? List.of(type) : List.of("movie","tv")) {
            String params = "&page=" + page + "&include_adult=false";
            String path = term.isBlank() ? "/discover/" + format + "?sort_by=popularity.desc" + (type.equals("anime") ? "&with_genres=16&with_original_language=ja" : "") :
                "/search/" + format + "?query=" + URLEncoder.encode(term,StandardCharsets.UTF_8);
            JsonNode result = tmdb.remote(path + params);
            more |= page < Math.min(result.path("total_pages").asInt(), 500);
            for (JsonNode item : result.path("results")) {
                Catalog.Title title = TmdbMapper.title(format,item);
                if (!type.equals("anime") || title.anime()) { summaries.store(title,item); found.add(title); }
            }
        }
        return new Found(found, more);
    }

    private static List<Catalog.Title> distinct(List<Catalog.Title> titles) {
        var unique = new LinkedHashMap<String,Catalog.Title>();
        for (var title : titles) unique.putIfAbsent(title.id(), title);
        return new ArrayList<>(unique.values());
    }

    /** Obras com nome parecido com o termo, da mais parecida para a menos; no máximo 20. */
    private static List<Catalog.Title> closest(List<Catalog.Title> candidates, String term) {
        return candidates.stream()
            .map(title -> Map.entry(title, SearchTerms.similarity(term, title.name(), title.original())))
            .filter(entry -> entry.getValue() >= SearchTerms.MIN_SIMILARITY)
            .sorted(Map.Entry.<Catalog.Title,Double>comparingByValue().reversed())
            .limit(20).map(Map.Entry::getKey).toList();
    }

    public record Season(int number,String name,String summary,String poster,String year) {}

    @GetMapping("/titles/{id}/seasons")
    List<Season> seasons(@PathVariable String id) {
        var series=detail(id);
        if(!"tv".equals(series.format()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if(id.startsWith("demo-")) {
            int total=series.details().seasons();
            return java.util.stream.IntStream.rangeClosed(1,total)
                .mapToObj(number->new Season(number,seasonName(number),"",null,series.year())).toList();
        }
        var result=new ArrayList<Season>();
        for(var row:tmdb.remote("/tv/"+id.substring("tmdb-tv-".length())).path("seasons")) {
            if(!row.path("season_number").canConvertToInt())continue;
            int number=row.path("season_number").asInt();
            if(number<0||number>1000||(number==0&&row.path("episode_count").asInt()==0))continue;
            String name=text(row,"name");
            String date=text(row,"air_date");
            result.add(new Season(number,name.isBlank()?seasonName(number):name,text(row,"overview"),
                posterUrl(row,"w500"),date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")?date.substring(0,4):""));
        }
        result.sort(Comparator.comparingInt(item->item.number()==0?1001:item.number()));
        return result;
    }

    private static String seasonName(int number) {
        return number==0?"Especiais":"Temporada "+number;
    }

    public record Episode(int number,String name,String summary,String still) {}

    @GetMapping("/titles/{id}/seasons/{season}")

    List<Episode> episodes(@PathVariable String id,@PathVariable int season) {

        if(season<0 || season>1000 || !"tv".equals(detail(id).format()))

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        if(id.startsWith("demo-")) {

            if(season==2 && id.equals("demo-mare-alta"))
                return List.of(new Episode(1,"O retorno","Episódio ilustrativo.",null));
            if(season!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);

            return List.of(
                new Episode(1,"Piloto","Episódio ilustrativo.",null),
                new Episode(2,"Segundo episódio","Episódio ilustrativo.",null));

        }

        JsonNode data=tmdb.remote("/tv/"+id.substring("tmdb-tv-".length())+"/season/"+season);

        List<Episode> result=new ArrayList<>();
        for(JsonNode episode:data.path("episodes"))
            result.add(new Episode(episode.path("episode_number").asInt(),text(episode,"name"),
                text(episode,"overview"),imageUrl(episode,"still_path","w780")));

        return result;

    }

    private static final java.util.regex.Pattern EPISODE_ID=java.util.regex.Pattern.compile("ep-((?:demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12}))-s(0|[1-9][0-9]{0,2}|1000)-e([1-9][0-9]{0,8})");

    private static final java.util.regex.Pattern SEASON_ID=java.util.regex.Pattern.compile("season-(demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12})-s(0|[1-9][0-9]{0,2}|1000)");

    private Catalog.Title seasonDetail(String id, java.util.regex.Matcher key) {
        String seriesId=key.group(1);
        int number=Integer.parseInt(key.group(2));
        var season=seasons(seriesId).stream().filter(item->item.number()==number).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        var series=detail(seriesId);
        return storeSeriesPart(new Catalog.Title(id,"seas",false,season.name(),series.name(),season.year(),season.summary(),season.poster()));
    }

    private Catalog.Title episodeDetail(String id, java.util.regex.Matcher key) {
        String seriesId=key.group(1);
        int season=Integer.parseInt(key.group(2));
        int number=Integer.parseInt(key.group(3));
        var episode=episodes(seriesId,season).stream().filter(item->item.number()==number).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        var series=detail(seriesId);
        String name=episode.name().isBlank()?"Episódio "+number:episode.name();
        return storeSeriesPart(new Catalog.Title(id,"ep",series.anime(),name,series.name(),series.year(),episode.summary(),episode.still()));
    }

    private Catalog.Title storeSeriesPart(Catalog.Title title) {
        try {
            db.update("insert into title(id,format,anime,name,original,release_year,summary,poster) values(?,?,?,?,?,?,?,?)",
                title.id(),title.format(),title.anime(),title.name(),title.original(),title.year(),title.summary(),title.poster());
        } catch (org.springframework.dao.DuplicateKeyException concurrentInsert) {
            // Outra consulta já armazenou os metadados.
        }
        return title;
    }

    @GetMapping("/titles/{id}") Catalog.Title detail(@PathVariable String id) {

        var sample = FIXTURES.stream().filter(t -> t.id().equals(id)).findFirst();

        if (sample.isPresent()) return sample.get().withDetails(demoDetails(id));

        var stored = db.query("select * from title where id=?", (row,n) -> {

            Catalog.Title title = new Catalog.Title(row.getString("id"),row.getString("format"),row.getBoolean("anime"),row.getString("name"),row.getString("original"),row.getString("release_year"),row.getString("summary"),row.getString("poster"));

            String details = row.getString("details");

            if (details == null) return title;

            try { return title.withDetails(mapper.readValue(details,Catalog.Details.class)); }

            catch (com.fasterxml.jackson.core.JsonProcessingException invalid) { return title; }

        },id);

        var episodeKey=EPISODE_ID.matcher(id);
        if(episodeKey.matches())return stored.isEmpty()?episodeDetail(id,episodeKey):stored.getFirst();
        var seasonKey=SEASON_ID.matcher(id);
        if(seasonKey.matches())return stored.isEmpty()?seasonDetail(id,seasonKey):stored.getFirst();

        if (!stored.isEmpty() && ((stored.getFirst().details()!=null && stored.getFirst().details().people()!=null) || tmdb.demo())) return stored.getFirst();

        if (tmdb.demo() || !id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);

        String[] parts = id.split("-");

        Catalog.Title title;

        try {

            JsonNode item=tmdb.remote("/" + parts[1] + "/" + parts[2] + (parts[1].equals("tv")?"?append_to_response=credits,aggregate_credits":"?append_to_response=credits"));

            title=TmdbMapper.title(parts[1],item).withDetails(TmdbMapper.details(parts[1],item));

        } catch (ResponseStatusException unavailable) {

            if (!stored.isEmpty()) return stored.getFirst();

            throw unavailable;

        }

        String details=mapper.valueToTree(title.details()).toString();

        if (!stored.isEmpty()) {

            db.update("update title set details=?,name=?,original=?,release_year=?,summary=?,poster=?,anime=? where id=?",

                details,title.name(),title.original(),title.year(),title.summary(),title.poster(),title.anime(),id);

            return title;

        }

        try {

            db.update("insert into title(id,format,anime,name,original,release_year,summary,poster,details) values(?,?,?,?,?,?,?,?,?)",title.id(),title.format(),title.anime(),title.name(),title.original(),title.year(),title.summary(),title.poster(),details);

        } catch (org.springframework.dao.DuplicateKeyException concurrentInsert) {

            return detail(id);

        }

        return title;

    }

    /**
     * Busca até 30 obras de uma vez.
     * @param ids identificadores das obras
     * @param genre gênero único (legado) para filtrar; 0 = sem filtro
     * @param genres gêneros para filtrar
     * @param details quando true, cada obra traz {@code details} (gêneros e duração) para estatísticas
     * @param providers serviços de streaming; quando informado, só voltam obras incluídas em algum deles
     * @return obras encontradas; ausentes são omitidas
     */
    @GetMapping("/title-batch") List<Catalog.Title> batch(@RequestParam List<String> ids,@RequestParam(defaultValue="0") int genre,@RequestParam(required=false) List<Integer> genres,@RequestParam(defaultValue="false") boolean details,@RequestParam(required=false) List<Integer> providers) {
        var found=titleBatch(ids,genre,genres);
        if(providers!=null&&!providers.isEmpty()) {
            if(providers.size()>StreamingAvailability.MAX_FILTER_PROVIDERS)throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            found=availability.onlyIncludedIn(found,new HashSet<>(providers));
        }
        return details?withStoredDetails(found):found;
    }

    /**
     * Completa os detalhes das obras do lote sem mudar o comportamento padrão do title-batch.
     * Usa o JSON de detalhes já salvo; se não houver e o TMDB estiver configurado, tenta buscá-lo
     * (falha vira fallback com os gêneros resumidos da busca, sem duração).
     */
    private List<Catalog.Title> withStoredDetails(List<Catalog.Title> titles) {
        var pending=titles.stream().filter(t -> t.details()==null).map(Catalog.Title::id).toList();
        if(pending.isEmpty())return titles;
        var stored=new HashMap<String,Catalog.Details>();
        var withoutDetails=new ArrayList<String>();
        String placeholders=String.join(",",Collections.nCopies(pending.size(),"?"));
        db.query("select id,details,genre_ids from title where id in ("+placeholders+")",row -> {
            String json=row.getString("details");
            try { if(json!=null) { stored.put(row.getString("id"),mapper.readValue(json,Catalog.Details.class)); return; } }
            catch(com.fasterxml.jackson.core.JsonProcessingException invalid) { /* usa o fallback abaixo */ }
            withoutDetails.add(row.getString("id"));
            String encoded=row.getString("genre_ids");
            var names=encoded==null||encoded.isBlank()?List.<String>of():Arrays.stream(encoded.split(","))
                .map(code -> { try { return GENRES.get(Integer.valueOf(code)); } catch(NumberFormatException bad) { return null; } })
                .filter(Objects::nonNull).toList();
            stored.put(row.getString("id"),new Catalog.Details(names,null,null,null,List.of(),List.of(),List.of()));
        },pending.toArray());
        if(!tmdb.demo()&&!withoutDetails.isEmpty()) {
            try(var executor=java.util.concurrent.Executors.newFixedThreadPool(6)) {
                var tasks=withoutDetails.stream().map(id -> executor.submit(() -> detail(id))).toList();
                for(var task:tasks) {
                    try { Catalog.Title title=task.get(); if(title.details()!=null)stored.put(title.id(),title.details()); }
                    catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
                    catch(java.util.concurrent.ExecutionException unavailable) { /* mantém o fallback */ }
                }
            }
        }
        return titles.stream().map(t -> t.details()!=null?t
            :FIXTURES.stream().anyMatch(f -> f.id().equals(t.id()))?t.withDetails(demoDetails(t.id()))
            :t.withDetails(stored.get(t.id()))).toList();
    }

    private List<Catalog.Title> titleBatch(List<String> ids,int genre,List<Integer> genres) {

        var selected=selectedGenres(genre,genres);
        if (ids.size() > 30) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        var output = new ArrayList<Catalog.Title>();

        for (String id : ids.stream().distinct().toList()) {

            FIXTURES.stream().filter(t -> t.id().equals(id)).findFirst().ifPresent(output::add);

        }

        var storedIds = ids.stream().distinct().filter(id -> id.matches("tmdb-(movie|tv)-[1-9][0-9]{0,12}") || EPISODE_ID.matcher(id).matches() || SEASON_ID.matcher(id).matches()).toList();

        var matches = new HashMap<String, Boolean>();
        var filmIds = selected.stream().map(String::valueOf).toList();
        var tvIds = roomGenreIds("tv",selected).stream().map(String::valueOf).toList();
        if (!storedIds.isEmpty()) {

            String placeholders = String.join(",", Collections.nCopies(storedIds.size(), "?"));

            output.addAll(db.query("select * from title where id in (" + placeholders + ")",

                (row,n) -> {
                    String id = row.getString("id");
                    String encoded = row.getString("genre_ids");
                    if (!selected.isEmpty() && encoded != null)
                        matches.put(id, !Collections.disjoint("tv".equals(row.getString("format"))?tvIds:filmIds, Arrays.asList(encoded.split(","))));
                    return new Catalog.Title(id,row.getString("format"),row.getBoolean("anime"),row.getString("name"),row.getString("original"),row.getString("release_year"),row.getString("summary"),row.getString("poster"));
                },storedIds.toArray()));

        }

        var missing=storedIds.stream().filter(id -> output.stream().noneMatch(t -> t.id().equals(id))).toList();
        if(!missing.isEmpty()) {
            try(var executor=java.util.concurrent.Executors.newFixedThreadPool(6)) {
                var tasks=missing.stream().map(id -> executor.submit(() -> {
                    try { return detail(id); }
                    catch(ResponseStatusException failure) {
                        if(failure.getStatusCode().value()==404)return null;
                        throw failure;
                    }
                })).toList();
                for(var task:tasks) {
                    try { Catalog.Title title=task.get();if(title!=null)output.add(title); }
                    catch(InterruptedException interrupted) { Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida."); }
                    catch(java.util.concurrent.ExecutionException failure) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível carregar todos os títulos. Tente novamente."); }
                }
            }
        }
        if(!selected.isEmpty()) {
            var fallback = output.stream().filter(t -> !matches.containsKey(t.id())).toList();
            var matchedDetails = new HashMap<String,Catalog.Title>();
            if (!fallback.isEmpty()) {
                try (var executor = java.util.concurrent.Executors.newFixedThreadPool(6)) {
                    var tasks = fallback.stream().map(t -> executor.submit(() -> t.details() == null ? detail(t.id()) : t)).toList();
                    for (var task : tasks) {
                        var title = task.get();
                        if (title.details() != null && selected.stream().anyMatch(g -> title.details().genres().contains(GENRES.get(g))))
                            matchedDetails.put(title.id(), title);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida.");
                } catch (java.util.concurrent.ExecutionException e) {
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível verificar os gêneros. Tente novamente.");
                }
            }
            var filtered = new ArrayList<Catalog.Title>();
            for (var title : output) {
                if (Boolean.TRUE.equals(matches.get(title.id()))) filtered.add(title);
                else if (matchedDetails.containsKey(title.id())) filtered.add(matchedDetails.get(title.id()));
            }
            return filtered;
        }
        return output;

    }
}
