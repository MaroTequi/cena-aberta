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

            posterUrl(item,"w500"));

    }



    static String normalize(String input) {

        return Normalizer.normalize(input,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT);

    }

    static Catalog.Details details(String format, JsonNode item) {

        boolean movie=format.equals("movie");

        JsonNode credits=item.path("credits");

        return new Catalog.Details(names(item.path("genres"),null,8),movie?positive(item.path("runtime")):null,

            movie?null:positive(item.path("number_of_seasons")),movie?null:positive(item.path("number_of_episodes")),

            movie?names(credits.path("crew"),"Director",5):List.of(),names(item.path("created_by"),null,5),names(credits.path("cast"),null,8),people(item));

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

    static String posterUrl(JsonNode item,String size){
        return imageUrl(item,"poster_path",size);
    }

    static String imageUrl(JsonNode item,String field,String size){
        String path=item.path(field).asText("");
        return path.matches("/[A-Za-z0-9._-]+")?"https://image.tmdb.org/t/p/"+size+path:null;
    }

    static String portrait(JsonNode item){
        String path=item.path("profile_path").asText("");
        return path.matches("/[A-Za-z0-9._-]+")?"https://image.tmdb.org/t/p/w185"+path:null;
    }

    static String text(JsonNode item,String field){ return item.path(field).asText(""); }

    private static void addPerson(Map<Long,Catalog.PersonCredit> group,JsonNode item,List<String> roles,boolean acting){
        long id=item.path("id").asLong();
        if(id<=0||text(item,"name").isBlank()||roles.isEmpty())return;
        var person=group.computeIfAbsent(id,key->new Catalog.PersonCredit(id,text(item,"name"),portrait(item),new ArrayList<>(),acting));
        for(String role:roles)if(!role.isBlank()&&!person.roles().contains(role))person.roles().add(role);
    }

    static List<String> roles(JsonNode item,boolean acting){
        String field=acting?"character":"job";
        var result=new LinkedHashSet<String>();
        for(var entry:item.path(acting?"roles":"jobs")){
            if(!text(entry,field).isBlank())result.add(text(entry,field));
        }
        if(!text(item,field).isBlank())result.add(text(item,field));
        if(acting&&result.isEmpty())result.add("Acting");
        return List.copyOf(result);
    }

    static List<Catalog.PersonCredit> people(JsonNode item){
        var cast=new LinkedHashMap<Long,Catalog.PersonCredit>();
        var crew=new LinkedHashMap<Long,Catalog.PersonCredit>();
        var credits=item.path("aggregate_credits").isObject()?item.path("aggregate_credits"):item.path("credits");
        for(var row:credits.path("cast"))addPerson(cast,row,roles(row,true),true);
        for(var row:item.path("created_by"))addPerson(crew,row,List.of("Creator"),false);
        for(var row:credits.path("crew"))addPerson(crew,row,roles(row,false),false);
        var result=new ArrayList<>(cast.values());
        result.addAll(crew.values());
        return result;
    }
}
