package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Gêneros do TMDB aceitos nos filtros (id → nome em português) e a tradução dos ids de filme para os de série. */
final class Genres {

    private Genres() {}

    static final Map<Integer,String> GENRES=Map.ofEntries(Map.entry(28,"Ação"),Map.entry(12,"Aventura"),Map.entry(16,"Animação"),Map.entry(35,"Comédia"),Map.entry(80,"Crime"),Map.entry(99,"Documentário"),Map.entry(18,"Drama"),Map.entry(10751,"Família"),Map.entry(14,"Fantasia"),Map.entry(36,"História"),Map.entry(27,"Terror"),Map.entry(10402,"Música"),Map.entry(9648,"Mistério"),Map.entry(10749,"Romance"),Map.entry(878,"Ficção científica"),Map.entry(10770,"Cinema TV"),Map.entry(53,"Thriller"),Map.entry(10752,"Guerra"),Map.entry(37,"Faroeste"));
    static List<Integer> selectedGenres(Integer genre,List<Integer> genres) {
        var selected=genres!=null?genres:genre==null||genre==0?List.<Integer>of():List.of(genre);
        if(selected.size()>GENRES.size()||selected.stream().anyMatch(g->g==null||!GENRES.containsKey(g)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        return selected.stream().distinct().toList();
    }
    static List<Integer> roomGenreIds(String format,List<Integer> genres){
        if(!format.equals("tv"))return genres;
        // TMDB combines several film genres under shared TV categories.
        return genres.stream().map(id->switch(id){
            case 28,12 -> 10759;
            case 878,14 -> 10765;
            case 10752 -> 10768;
            default -> id;
        }).distinct().toList();
    }
}
