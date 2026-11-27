package br.com.cenaaberta;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

/** Serviços de streaming assinados: leitura, substituição da lista e validações. */
class StreamingServicesTest {
    static final String ANA="ana-actor",BIA="bia-actor";
    JdbcTemplate db;StreamingServices services;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        TestDatabase.profile(db,ANA);TestDatabase.profile(db,BIA);
        services=new StreamingServices(db,new ActiveActors(db));
    }

    StreamingServices.ProvidersInput input(Integer... providers) { return new StreamingServices.ProvidersInput(Arrays.asList(providers)); }

    @Test void shouldStartEmptyAndReplaceTheWholeList() {
        assertEquals(Map.of("providers",List.of()),services.mine(ANA));
        assertEquals(Map.of("providers",List.of(8,119,337)),services.save(ANA,input(337,8,119,8)));
        assertEquals(Map.of("providers",List.of(8,119,337)),services.mine(ANA));
        assertEquals(Map.of("providers",List.of(307)),services.save(ANA,input(307)));
        assertEquals(Map.of("providers",List.of()),services.save(ANA,input()));
        assertEquals(Map.of("providers",List.of()),services.mine(ANA));
    }

    @Test void shouldKeepEachPersonsListSeparate() {
        services.save(ANA,input(8));
        services.save(BIA,input(119));
        assertEquals(Map.of("providers",List.of(8)),services.mine(ANA));
        assertEquals(Map.of("providers",List.of(119)),services.mine(BIA));
    }

    @Test void shouldRejectInvalidLists() {
        services.save(ANA,input(8));
        assertEquals("Informe os serviços.",fails(400,() -> services.save(ANA,new StreamingServices.ProvidersInput(null))).getReason());
        assertEquals("Serviço de streaming inválido.",fails(400,() -> services.save(ANA,input(8,null))).getReason());
        assertEquals("Serviço de streaming inválido.",fails(400,() -> services.save(ANA,input(0))).getReason());
        var many=new ArrayList<Integer>();for(int id=1;id<=61;id++)many.add(id);
        assertEquals("Escolha até 60 serviços.",fails(400,() -> services.save(ANA,new StreamingServices.ProvidersInput(many))).getReason());
        assertEquals(Map.of("providers",List.of(8)),services.mine(ANA),"lista anterior continua depois de uma tentativa inválida");
    }

    @Test void shouldNotServeSuspendedOrUnknownAccounts() {
        db.update("update profile set active=false where actor=?",BIA);
        assertEquals("Acesso suspenso.",fails(403,() -> services.mine(BIA)).getReason());
        assertEquals("Acesso suspenso.",fails(403,() -> services.save(BIA,input(8))).getReason());
        fails(404,() -> services.mine("ninguem-actor"));
        fails(401,() -> services.mine(null));
    }
}
