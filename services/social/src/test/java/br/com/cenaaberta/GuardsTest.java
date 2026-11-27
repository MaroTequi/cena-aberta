package br.com.cenaaberta;
import java.time.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
class GuardsTest {
 HttpStatus statusOf(Runnable call){ return HttpStatus.valueOf(assertThrows(ResponseStatusException.class,call::run).getStatusCode().value()); }
 @Test void validTitlesPass(){
 assertDoesNotThrow(()->Guards.validateTitle("demo-a"));
 assertDoesNotThrow(()->Guards.validateTitle("tmdb-tv-1"));
 }
 @Test void invalidTitlesAre400(){
 for(String id:new String[]{"tmdb-tv-0","../x",null}) assertEquals(HttpStatus.BAD_REQUEST,statusOf(()->Guards.validateTitle(id)));
 }
 @Test void shortActorIs401(){ assertEquals(HttpStatus.UNAUTHORIZED,statusOf(()->Guards.validateActor("curto"))); }
 @Test void validActorPasses(){ assertDoesNotThrow(()->Guards.validateActor("actor-12345")); }
 @Test void blankRequiredIs400(){ assertEquals(HttpStatus.BAD_REQUEST,statusOf(()->Guards.required("  ",80))); }
 @Test void requiredStripsValue(){ assertEquals("ok",Guards.required("  ok ",80)); }
 @Test void optionalAboveLimitIs400(){ assertEquals(HttpStatus.BAD_REQUEST,statusOf(()->Guards.optional("a".repeat(81),80))); }
 @Test void optionalNullIsEmpty(){ assertEquals("",Guards.optional(null,80)); }
 @Test void futureDateIs400(){
 assertEquals(HttpStatus.BAD_REQUEST,statusOf(()->Guards.checkDate(LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusDays(1))));
 assertDoesNotThrow(()->Guards.checkDate(null));
 }
}
