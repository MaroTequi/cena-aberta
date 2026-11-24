package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

/** Banco H2 em memória com TODAS as migrações aplicadas na ordem de versão, como o Flyway faz em produção. */
final class TestDatabase {

    private TestDatabase() {}

    /**
     * Cria um banco novo e isolado com o schema completo.
     * @return JdbcTemplate ligado ao banco
     */
    static JdbcTemplate migrated() {
        var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
        try {
            Resource[] scripts=new PathMatchingResourcePatternResolver().getResources("classpath:db/migration/V*__*.sql");
            Arrays.sort(scripts,Comparator.comparingInt(TestDatabase::version));
            new ResourceDatabasePopulator(scripts).execute(source);
        } catch(java.io.IOException failure) { throw new IllegalStateException(failure); }
        return new JdbcTemplate(source);
    }

    private static int version(Resource script) {
        String name=Objects.requireNonNull(script.getFilename());
        return Integer.parseInt(name.substring(1,name.indexOf("__")));
    }

    /** Cria um perfil ativo com actor, username e nome iguais ao apelido informado. */
    static void profile(JdbcTemplate db,String actor) {
        db.update("insert into profile(actor,username,name) values(?,?,?)",actor,actor.split("-")[0],actor.split("-")[0]);
    }

    /** Cria uma amizade aceita entre dois actors. */
    static void friends(JdbcTemplate db,String a,String b) {
        db.update("insert into friendship(id,requester,recipient,status) values(?,?,?,'accepted')",UUID.randomUUID().toString(),a,b);
    }

    /**
     * Catálogo falso a partir de um array JSON no formato do title-batch; ignora o flag de detalhes.
     * @param json array de obras ({id,format,anime,name,year,details})
     * @return CatalogTitles que devolve só as obras pedidas que existem no array
     */
    static CatalogTitles catalog(String json) {
        var byId=new HashMap<String,JsonNode>();
        try { for(JsonNode title:new ObjectMapper().readTree(json)) byId.put(title.path("id").asText(),title); }
        catch(java.io.IOException failure) { throw new IllegalStateException(failure); }
        return (ids,details) -> {
            var result=new HashMap<String,JsonNode>();
            for(String id:ids) if(byId.containsKey(id)) result.put(id,byId.get(id));
            return result;
        };
    }

    /** Afirma que a chamada falha com o status HTTP informado e devolve a exceção. */
    static org.springframework.web.server.ResponseStatusException fails(int status,Runnable call) {
        var failure=org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.server.ResponseStatusException.class,call::run);
        org.junit.jupiter.api.Assertions.assertEquals(status,failure.getStatusCode().value());
        return failure;
    }
}
