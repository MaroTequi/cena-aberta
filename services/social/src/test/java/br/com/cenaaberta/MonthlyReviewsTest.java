package br.com.cenaaberta;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import static org.mockito.Mockito.mock;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import static org.junit.jupiter.api.Assertions.*;

class MonthlyReviewsTest {
    @Test void filtersBeforeLimitingAndRespectsSpoilers(){
        var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
        var migrations=new ResourceDatabasePopulator();
        for(String file:List.of("V1__social.sql","V3__profile_cpf_avatar.sql","V7__episode_rating.sql","V8__public_evaluations.sql","V25__review_spoiler_vote.sql","V27__review_publication.sql"))
            migrations.addScript(new ClassPathResource("db/migration/"+file));
        migrations.execute(source);
        var db=new JdbcTemplate(source);
        var service=new Community(db,new ActiveActors(db),mock(LibraryEntries.class));
        var date=OffsetDateTime.now();
        for(int i=0;i<60;i++){
            String user="reader"+i;
            db.update("insert into profile(actor,username,name,active) values(?,?,?,?)",user,user,user,i!=59);
            db.update("insert into library(actor,title,review,evaluation_public,hidden,spoiler,watched,review_published_at) values(?,?,?,?,?,?,?,?)",
                user,i==56?"old":"new","Resenha",i!=57,i==58,true,i==1,date.plusMinutes(i));
        }
        var publicFeed=service.releaseReviews(List.of("new"),null);
        assertEquals(50,publicFeed.size());
        assertEquals("reader55",publicFeed.getFirst().get("username"));
        assertEquals("reader6",publicFeed.getLast().get("username"));
        assertEquals(true,publicFeed.getFirst().get("spoiler"));
        assertEquals(false,service.releaseReviews(List.of("new"),"reader1").getFirst().get("spoiler"));
        assertEquals(false,service.releaseReviews(List.of("new"),"reader55").getFirst().get("spoiler"));
    }
}
