package br.com.cenaaberta;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Notas por episódio e médias por temporada. */
@RestController
public class Episodes {

    public record EpisodeRating(Integer rating) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final CatalogSeasons seasons;
    private final LibraryEntries entries;

    Episodes(JdbcTemplate db,ActiveActors actors,CatalogSeasons seasons,LibraryEntries entries) {
        this.db=db; this.actors=actors; this.seasons=seasons; this.entries=entries;
    }

    @GetMapping("/me/episodes/{title}")
    List<Map<String,Object>> mySeasonAverages(@RequestHeader("X-Actor") String actor,@PathVariable String title) {
        actors.requireActive(actor);
        validateTitle(title);
        return db.queryForList("""
            select season,sum(rating) as total,count(*) as votes
            from episode_rating where actor=? and title=? group by season order by season
            """,actor,title).stream().map(row->Map.<String,Object>of("season",row.get("season"),
                "average",roundedEpisodeAverage(((Number)row.get("total")).longValue(),((Number)row.get("votes")).longValue())))
            .toList();
    }

    @GetMapping("/me/episodes/{title}/{season}")

    List<Map<String,Object>> episodeRatings(@RequestHeader("X-Actor") String actor,

            @PathVariable String title,@PathVariable int season) {

        actors.requireActive(actor);

        return db.queryForList("select episode,rating from episode_rating where actor=? and title=? and season=?",actor,title,season);

    }



    @PutMapping("/me/episodes/{title}/{season}/{episode}")

    @Transactional

    void rateEpisode(@RequestHeader("X-Actor") String actor,@PathVariable String title,

            @PathVariable int season,@PathVariable int episode,@RequestBody EpisodeRating input) {

        actors.lockActive(actor);

        validateTitle(title);

        if(EPISODE_ID.matcher(title).matches()||SEASON_ID.matcher(title).matches()||season<0||season>1000||episode<1||episode>999999999||input.rating()!=null&&(input.rating()<1||input.rating()>10))

            fail(HttpStatus.BAD_REQUEST,"Episódio ou nota inválidos.");

        if(!seasonEpisodes(title,season).contains(episode))fail(HttpStatus.NOT_FOUND,"Episódio não encontrado.");
        String episodeId="ep-"+title+"-s"+season+"-e"+episode;
        if(input.rating()!=null && !Rows.exists(db,"select count(*) from library where actor=? and title=?",actor,episodeId)) {
            entries.createLibraryEntry(actor,episodeId,title);
        }
        db.update("update library set rating=? where actor=? and title=?",input.rating(),actor,episodeId);
        if(input.rating()!=null)entries.markWatched(actor,episodeId);
        entries.saveEpisodeRating(actor,title,season,episode,input.rating());
    }

    Set<Integer> seasonEpisodes(String series,int season) {
        validateTitle(series);
        if(SEASON_ID.matcher(series).matches()||EPISODE_ID.matcher(series).matches()||season<0||season>1000)
            fail(HttpStatus.BAD_REQUEST,"Temporada inválida.");
        return catalogNumbers(seasons.season(series,season),"number",1,999999999);
    }

    private Set<Integer> catalogNumbers(com.fasterxml.jackson.databind.JsonNode inventory,String field,int minimum,int maximum) {
        Set<Integer> numbers=new LinkedHashSet<>();
        for(var item:inventory) {
            var value=item.path(field);
            if(value.isIntegralNumber()&&value.canConvertToInt()&&value.asInt()>=minimum&&value.asInt()<=maximum)
                numbers.add(value.asInt());
        }
        return numbers;
    }

    record SeasonProgress(int watched,int total,Double average,boolean rewatched,boolean complete) {}

    @GetMapping("/me/season-progress/{series}/{season}")
    SeasonProgress seasonProgress(@RequestHeader("X-Actor") String actor,@PathVariable String series,@PathVariable int season) {
        actors.requireActive(actor);
        return seasonProgress(actor,series,season,seasonEpisodes(series,season));
    }

    @GetMapping("/me/series-progress/{series}")
    Map<String,Boolean> seriesProgress(@RequestHeader("X-Actor") String actor,@PathVariable String series) {
        actors.requireActive(actor);
        validateTitle(series);
        if(!entries.episodic(series))fail(HttpStatus.BAD_REQUEST,"Série inválida.");
        var seasons=catalogNumbers(this.seasons.seasons(series),"number",0,1000);
        if(seasons.isEmpty())return Map.of("complete",false);

        String episodePrefix="ep-"+series+"-s";
        var watched=watchedEpisodes(actor,episodePrefix);
        var seasonPrefixes=seasons.stream().map(season->episodePrefix+season+"-e").toList();
        if(seasonPrefixes.stream().anyMatch(prefix->watched.stream().noneMatch(id->id.startsWith(prefix))))
            return Map.of("complete",false);

        return Map.of("complete",seasons.stream().allMatch(season->
            allEpisodesMatch(episodePrefix+season+"-e",seasonEpisodes(series,season),watched)));
    }

    private SeasonProgress seasonProgress(String actor,String series,int season,Set<Integer> episodes) {
        String prefix="ep-"+series+"-s"+season+"-e";
        var watched=watchedEpisodes(actor,prefix);
        int count=(int)episodes.stream().filter(number->watched.contains(prefix+number)).count();
        var ratings=db.queryForList("select rating from episode_rating where actor=? and title=? and season=?",Integer.class,actor,series,season);
        boolean complete=!episodes.isEmpty()&&count==episodes.size();
        return new SeasonProgress(count,episodes.size(),roundedEpisodeAverage(ratings.stream().mapToInt(Integer::intValue).sum(),ratings.size()),
            seasonRewatched(actor,prefix,episodes),complete);
    }

    boolean seasonRewatched(String actor,String prefix,Set<Integer> episodes) {
        return allEpisodesMatch(prefix,episodes,repeatedViewings(actor,prefix));
    }

    private static boolean allEpisodesMatch(String prefix,Set<Integer> episodes,Set<String> eligible) {
        return !episodes.isEmpty()&&episodes.stream().allMatch(number->eligible.contains(prefix+number));
    }

    private Set<String> repeatedViewings(String actor,String prefix) {
        return new HashSet<>(db.queryForList("""
            select title from viewing where actor=? and title like ?
            group by title having count(*)>=2
            """,String.class,actor,prefix+"%"));
    }

    private Set<String> watchedEpisodes(String actor,String prefix) {
        return new HashSet<>(db.queryForList("select title from library where actor=? and watched=true and title like ?",String.class,actor,prefix+"%"));
    }

    static Double roundedEpisodeAverage(long sum,long count) {
        if(count==0)return null;
        // As notas são inteiras de 1 a 10. No ponto médio, mantenha a meia estrela inferior.
        return seasonHalfStars(sum,count)/2.0;
    }

    static int seasonHalfStars(long sum,long count) {
        return (int)((2*sum+count-1)/(2*count));
    }

    static int seriesHalfStars(IntSummaryStatistics seasons) {
        return (int)((seasons.getSum()+seasons.getCount()-1)/seasons.getCount());
    }

}
