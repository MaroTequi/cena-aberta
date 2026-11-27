package br.com.cenaaberta;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class TmdbMapperTest {
 ObjectMapper json=new ObjectMapper();
 @Test void mapsMovieIdYearAndPoster() throws Exception {
 var t=TmdbMapper.title("movie",json.readTree("""
 {"id":603,"title":"Matrix","original_title":"The Matrix","release_date":"1999-03-31",
 "overview":"x","poster_path":"/abc.jpg","genre_ids":[28],"original_language":"en"}"""));
 assertEquals("tmdb-movie-603",t.id());assertEquals("1999",t.year());
 assertEquals("https://image.tmdb.org/t/p/w500/abc.jpg",t.poster());assertFalse(t.anime());
 assertEquals("Matrix",t.name());assertEquals("The Matrix",t.original());assertEquals("movie",t.format());
 }
 @Test void animeNeedsAnimationGenreAndJapanese() throws Exception {
 assertTrue(TmdbMapper.title("movie",json.readTree("{\"id\":1,\"genre_ids\":[16],\"original_language\":\"ja\"}")).anime());
 assertFalse(TmdbMapper.title("movie",json.readTree("{\"id\":1,\"genre_ids\":[16],\"original_language\":\"en\"}")).anime());
 assertTrue(TmdbMapper.title("movie",json.readTree("{\"id\":1,\"genres\":[{\"id\":16}],\"original_language\":\"ja\"}")).anime());
 assertFalse(TmdbMapper.title("movie",json.readTree("{\"id\":1,\"genre_ids\":[28],\"original_language\":\"ja\"}")).anime());
 }
 @Test void nameFallsBackToOriginalThenPlaceholder() throws Exception {
 assertEquals("Orig",TmdbMapper.title("movie",json.readTree("{\"id\":1,\"title\":\"\",\"original_title\":\"Orig\"}")).name());
 assertEquals("Título indisponível",TmdbMapper.title("movie",json.readTree("{\"id\":1,\"title\":\"\",\"original_title\":\"\"}")).name());
 }
 @Test void rejectsUnsafePosterPath() throws Exception {
 assertNull(TmdbMapper.title("movie",json.readTree("{\"id\":1,\"poster_path\":\"../x.jpg\"}")).poster());
 assertNull(TmdbMapper.title("movie",json.readTree("{\"id\":1,\"poster_path\":\"/a b.jpg\"}")).poster());
 assertNull(TmdbMapper.title("movie",json.readTree("{\"id\":1}")).poster());
 }
 @Test void tvUsesNameAndFirstAirDate() throws Exception {
 var t=TmdbMapper.title("tv",json.readTree("{\"id\":7,\"name\":\"Serie\",\"original_name\":\"Series\",\"first_air_date\":\"2011-04-17\",\"title\":\"errado\",\"release_date\":\"1900-01-01\"}"));
 assertEquals("tmdb-tv-7",t.id());assertEquals("Serie",t.name());assertEquals("Series",t.original());assertEquals("2011",t.year());
 }
 @Test void detailsForMovieAndTv() throws Exception {
 var item=json.readTree("""
 {"genres":[{"name":"Ação"},{"name":" Drama "}],"runtime":136,"number_of_seasons":3,"number_of_episodes":30,
 "credits":{"crew":[{"name":"Ana","job":"Director"},{"name":"Bia","job":"Writer"}],"cast":[{"name":"Caio"}]},
 "created_by":[{"name":"Duda"}]}""");
 var movie=TmdbMapper.details("movie",item);
 assertEquals(java.util.List.of("Ação","Drama"),movie.genres());assertEquals(136,movie.runtime());
 assertNull(movie.seasons());assertNull(movie.episodes());
 assertEquals(java.util.List.of("Ana"),movie.directors());assertEquals(java.util.List.of("Caio"),movie.cast());
 var tv=TmdbMapper.details("tv",item);
 assertNull(tv.runtime());assertEquals(3,tv.seasons());assertEquals(30,tv.episodes());assertTrue(tv.directors().isEmpty());
 }
 @Test void normalizeRemovesAccentsAndCase() { assertEquals("acao",TmdbMapper.normalize("AÇÃO")); }
}
