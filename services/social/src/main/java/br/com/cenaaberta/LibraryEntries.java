package br.com.cenaaberta;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import static br.com.cenaaberta.Guards.*;

/** Operações compartilhadas sobre a linha da biblioteca de um usuário (diário, episódios e biblioteca). */
@Component
class LibraryEntries {

    private final JdbcTemplate db;
    private final TitleVerifier titles;

    LibraryEntries(JdbcTemplate db,TitleVerifier titles) { this.db=db; this.titles=titles; }

    /** Garante a linha da biblioteca, verificando a obra no catálogo antes de criá-la; actor e titleId identificam a linha. */
    void ensure(String actor,String titleId) {
        validateTitle(titleId);
        if (!Rows.exists(db,"select count(*) from library where actor=? and title=?",actor,titleId)) {
            titles.verify(titleId);
            db.update("insert into library(actor,title,evaluation_public,spoiler) values(?,?,true,false)",actor,titleId);
        }
    }

    /** Marca a obra como assistida e a tira do Vou ver. */
    void markWatched(String actor,String id) {
        if(SEASON_ID.matcher(id).matches())return;
        db.update("update library set watched=true,interest=false where actor=? and title=?",actor,id);
        syncEpisodeSeason(actor,id);
    }

    /** Diz se a obra é uma série; ids tmdb-tv-* ou demo-* que o catálogo informa como "tv". */
    boolean episodic(String titleId) {
        return titleId.startsWith("tmdb-tv-") || (titleId.startsWith("demo-") && "tv".equals(titles.verify(titleId)));
    }

    void syncEpisodeSeason(String actor,String id) {
        var key=EPISODE_ID.matcher(id);
        if(key.matches())syncSeasonWatched(actor,key.group(1),Integer.parseInt(key.group(2)));
    }

    private void syncSeasonWatched(String actor,String series,int season) {
        String id="season-"+series+"-s"+season;
        boolean watched=Rows.exists(db,"select count(*) from library where actor=? and watched=true and title like ?",
            actor,"ep-"+series+"-s"+season+"-e%");
        if(watched) {
            if(!Rows.exists(db,"select count(*) from library where actor=? and title=?",actor,id))createLibraryEntry(actor,id,series);
            db.update("update library set watched=true,interest=false where actor=? and title=?",actor,id);
        } else {
            db.update("update library set watched=false,rewatching=false where actor=? and title=?",actor,id);
        }
    }

    void createLibraryEntry(String actor,String id,String seriesId) {
        boolean visible=seriesId==null || !Rows.exists(db,
            "select count(*) from library where actor=? and title=? and (not evaluation_public or hidden)",actor,seriesId);
        db.update("insert into library(actor,title,evaluation_public,spoiler) values(?,?,?,false)",actor,id,visible);
    }

    void saveEpisodeRating(String actor,String title,int season,int episode,Integer rating) {
        db.update("delete from episode_rating where actor=? and title=? and season=? and episode=?",actor,title,season,episode);
        if(rating!=null) {
            db.update("insert into episode_rating values(?,?,?,?,?)",actor,title,season,episode,rating);
            if(!Rows.exists(db,"select count(*) from library where actor=? and title=?",actor,title))
                db.update("insert into library(actor,title,evaluation_public,spoiler) values(?,?,true,false)",actor,title);
            markWatched(actor,title);
        }
    }
}
