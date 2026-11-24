package br.com.cenaaberta;

import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import static org.junit.jupiter.api.Assertions.*;

class MonthlyReleasesTest {
    @Test void includesOnlyReleasedTitlesInCurrentMonth(){
        var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__catalog.sql"),new ClassPathResource("db/migration/V4__review_release_dates.sql")).execute(source);
        var db=new JdbcTemplate(source);
        var catalog=new Catalog(db,new ObjectMapper(),"a".repeat(24),"","");
        var today=LocalDate.now(ZoneId.of("America/Sao_Paulo"));
        var ids=List.of("tmdb-tv-1","tmdb-movie-2","tmdb-tv-3","tmdb-movie-4","tmdb-tv-5");
        var dates=Arrays.asList(today.withDayOfMonth(1),today,today.plusDays(1),today.withDayOfMonth(1).minusDays(1),null);
        for(int i=0;i<ids.size();i++)
            db.update("insert into review_release_date values(?,?,?,CURRENT_TIMESTAMP)",ids.get(i),"Obra",dates.get(i));
        assertEquals(ids.subList(0,2),catalog.reviewReleases(ids).stream().map(Catalog.ReviewRelease::id).toList());
    }
}
