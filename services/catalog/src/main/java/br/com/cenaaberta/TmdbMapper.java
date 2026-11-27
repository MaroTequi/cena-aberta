package br.com.cenaaberta;

import com.fasterxml.jackson.databind.JsonNode;
import java.text.Normalizer;
import java.util.*;

/** Converte respostas do TMDB em registros do catálogo (lógica pura, sem I/O). */
final class TmdbMapper {
    private TmdbMapper() {}

    static Catalog.Title title(String format, JsonNode item) {

        boolean animation = false;

        for (JsonNode genre : item.path("genre_ids")) animation |= genre.asInt() == 16;

        for (JsonNode genre : item.path("genres")) animation |= genre.path("id").asInt() == 16;

        String date = item.path(format.equals("movie") ? "release_date" : "first_air_date").asText("");

        String original = item.path(format.equals("movie") ? "original_title" : "original_name").asText("");

        String name = item.path(format.equals("movie") ? "title" : "name").asText("");


        return new Catalog.Title("tmdb-" + format + "-" + item.path("id").asLong(),format,animation && item.path("original_language").asText().equals("ja"),

            name.isBlank() ? original.isBlank() ? "Título indisponível" : original : name, original,

            date.length() >= 4 ? date.substring(0,4) : "",item.path("overview").asText(""),

            Catalog.posterUrl(item,"w500"));

    }



    static String normalize(String input) {

        return Normalizer.normalize(input,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT);

    }

    static Catalog.Details details(String format, JsonNode item) {

        boolean movie=format.equals("movie");

        JsonNode credits=item.path("credits");

        return new Catalog.Details(names(item.path("genres"),null,8),movie?positive(item.path("runtime")):null,

            movie?null:positive(item.path("number_of_seasons")),movie?null:positive(item.path("number_of_episodes")),

            movie?names(credits.path("crew"),"Director",5):List.of(),names(item.path("created_by"),null,5),names(credits.path("cast"),null,8),Catalog.people(item));

    }



    private static Integer positive(JsonNode value) { return value.asInt()>0?value.asInt():null; }



    private static List<String> names(JsonNode items,String job,int limit) {

        var names=new LinkedHashSet<String>();

        for(JsonNode item:items) {

            if(job!=null && !job.equals(item.path("job").asText())) continue;

            String name=item.path("name").asText("").strip();

            if(!name.isEmpty())names.add(name);

            if(names.size()==limit)break;

        }

        return List.copyOf(names);

    }
}
