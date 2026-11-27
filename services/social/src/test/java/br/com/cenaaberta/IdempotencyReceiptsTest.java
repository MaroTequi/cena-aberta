package br.com.cenaaberta;
import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
class IdempotencyReceiptsTest {
 static final String ACTOR="actor-12345",ACTION="rate",KEY="chave-12345";
 JdbcTemplate db;IdempotencyReceipts receipts;
 @BeforeEach void setup(){
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql")).execute(source);
 db=new JdbcTemplate(source);db.update("insert into profile(actor,username,name) values(?,?,?)",ACTOR,"ana","Ana");
 receipts=new IdempotencyReceipts(db,new ObjectMapper());
 }
 @Test void noReceiptReturnsNull(){ assertNull(receipts.find(ACTOR,ACTION,KEY,Map.of("a",1))); }
 @Test void sameKeySameBodyReturnsSavedId(){
 receipts.save(ACTOR,ACTION,KEY,Map.of("a",1),"id-1");
 assertEquals("id-1",receipts.find(ACTOR,ACTION,KEY,Map.of("a",1)));
 }
 @Test void sameKeyDifferentBodyIs409(){
 receipts.save(ACTOR,ACTION,KEY,Map.of("a",1),"id-1");
 var error=assertThrows(ResponseStatusException.class,()->receipts.find(ACTOR,ACTION,KEY,Map.of("a",2)));
 assertEquals(HttpStatus.CONFLICT.value(),error.getStatusCode().value());
 assertEquals("Chave já usada com outros dados.",error.getReason());
 }
 @Test void invalidKeyIs400(){
 for(String key:new String[]{"curta","x".repeat(81),null}){
 var error=assertThrows(ResponseStatusException.class,()->receipts.find(ACTOR,ACTION,key,Map.of()));
 assertEquals(HttpStatus.BAD_REQUEST.value(),error.getStatusCode().value());
 assertEquals("Chave de repetição inválida.",error.getReason());
 }
 }
 @Test void receiptsOlderThan24hExpire(){
 receipts.save(ACTOR,ACTION,KEY,Map.of("a",1),"id-1");
 db.update("update request_receipt set created=?",OffsetDateTime.now(ZoneOffset.UTC).minusHours(25));
 assertNull(receipts.find(ACTOR,ACTION,KEY,Map.of("a",1)));
 }
}
