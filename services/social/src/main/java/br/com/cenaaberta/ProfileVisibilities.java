package br.com.cenaaberta;

import java.util.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Leitura de quais seções do perfil (Vou ver, ranking, assistidos, diário, listas) o dono deixou públicas. */
@Component
class ProfileVisibilities {

    private final JdbcTemplate db;

    ProfileVisibilities(JdbcTemplate db) { this.db=db; }

    /** Mapa seção → visível, sempre na ordem watchlist, ranking, watched, diary, lists; 404 se o perfil não existe. */
    Map<String,Object> read(String actor){
        var row=Rows.one(db,"select show_watchlist,show_ranking,show_watched,show_diary,show_lists from profile where actor=?",actor);
        var result=new LinkedHashMap<String,Object>();
        for(String section:List.of("watchlist","ranking","watched","diary","lists"))result.put(section,row.get("show_"+section));
        return result;
    }
}
