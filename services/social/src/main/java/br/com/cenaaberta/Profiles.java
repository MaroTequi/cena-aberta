package br.com.cenaaberta;

import java.util.*;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Perfil do usuário: painel próprio (/me), cadastro do perfil, perfil público de outra pessoa e visibilidade das seções. */
@RestController
public class Profiles {

    public record Profile(String username,String name,String bio,String avatar) {}

    record ProfileVisibility(String section,Boolean visible) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final Ranking rankings;
    private final Viewings viewings;
    private final ProfileVisibilities visibilities;

    Profiles(JdbcTemplate db,ActiveActors actors,Ranking rankings,Viewings viewings,ProfileVisibilities visibilities) {
        this.db=db; this.actors=actors; this.rankings=rankings; this.viewings=viewings; this.visibilities=visibilities;
    }

    @GetMapping("/me") Map<String,Object> me(@RequestHeader("X-Actor") String actor, @RequestParam(defaultValue="false") boolean summary, @RequestParam(required=false) String title) {

        validateActor(actor);

        var profiles=db.queryForList("select username,name,bio,avatar,active from profile where actor=?",actor);

        if (profiles.isEmpty()) return Map.of("needsProfile",true);

        if(!Boolean.TRUE.equals(profiles.getFirst().get("active")) && db.queryForObject("select count(*) from email_account where actor=? and state='paused'",Integer.class,actor)>0)return Map.of("paused",true);
        ActiveActors.checkActive(profiles.getFirst());

        if (title != null) validateTitle(title);
        return dashboard(profiles.getFirst(),actor,true,summary,title);

    }

    @PutMapping("/me/profile")
    Map<String,Object> profile(@RequestHeader("X-Actor") String actor,@RequestBody Profile input) {

        validateActor(actor);

        String username=ProfileFields.username(input.username());

        String name=required(input.name(),80), bio=optional(input.bio(),300);

        String avatar=ProfileFields.avatar(input.avatar());

        try {

            int count=db.update("update profile set username=?,name=?,bio=?,avatar=coalesce(?,avatar) where actor=? and active=true",username,name,bio,avatar,actor);

            if (count==0) {

                if (Rows.exists(db,"select count(*) from profile where actor=?",actor)) fail(HttpStatus.FORBIDDEN,"Acesso suspenso.");

                db.update("insert into profile(actor,username,name,bio,avatar) values(?,?,?,?,?)",actor,username,name,bio,avatar);

            }

        } catch (DuplicateKeyException duplicate) { fail(HttpStatus.CONFLICT,"Nome de usuário já cadastrado."); }

        return me(actor,false,null);

    }

    @GetMapping("/profiles")
    Map<String,Object> profileByName(@RequestHeader("X-Actor") String actor,@RequestParam String username, @RequestParam(defaultValue="false") boolean summary) {
        return publicProfile(actor,username,summary);
    }

    @GetMapping("/profiles/{username}")
    Map<String,Object> publicProfile(@RequestHeader("X-Actor") String actor,@PathVariable String username, @RequestParam(defaultValue="false") boolean summary) {

        actors.requireActive(actor);

        var target=Rows.one(db,"select actor,username,name,bio,avatar from profile where username=? and active=true",ProfileFields.username(username));

        return dashboard(target,(String)target.get("actor"),false,summary,null);

    }

    @PutMapping("/me/visibility") @Transactional
    Map<String,Object> visibility(@RequestHeader("X-Actor") String actor,@RequestBody ProfileVisibility input){
        actors.lockActive(actor);
        if(input.visible()==null||input.section()==null||!Set.of("all","watchlist","ranking","watched","diary","lists").contains(input.section()))fail(HttpStatus.BAD_REQUEST,"Seção inválida.");
        if(input.section().equals("all"))db.update("update profile set show_watchlist=?,show_ranking=?,show_watched=?,show_diary=?,show_lists=? where actor=?",input.visible(),input.visible(),input.visible(),input.visible(),input.visible(),actor);
        else db.update("update profile set show_"+input.section()+"=? where actor=?",input.visible(),actor);
        return visibilities.read(actor);
    }

    private Map<String,Object> dashboard(Map<String,Object> profile,String actor,boolean own,boolean summary,String title) {
        var visibility=visibilities.read(actor);
        var diary = own || Boolean.TRUE.equals(visibility.get("diary"))
                ? viewings.page(actor, 1, null) : new Viewings.DiaryPage(List.of(), false);
        List<Map<String,Object>> library;
        if(summary)library=List.of();
        else if(own && title!=null)library=db.queryForList("select title,watched,interest,rewatching,rating,review,spoiler,hidden,version,evaluation_public from library where actor=? and title=?",actor,title);
        else if(own)library=db.queryForList("select title,watched,interest,rewatching,rating,review,spoiler,hidden,version,evaluation_public from library where actor=? order by title limit 1000",actor);
        else {
            boolean watched=Boolean.TRUE.equals(visibility.get("watched")),watchlist=Boolean.TRUE.equals(visibility.get("watchlist"));
            library=db.queryForList("select title,watched,interest,rewatching,rating,review,"+Community.EFFECTIVE_SPOILER+" as spoiler,hidden,evaluation_public from library l where actor=? and ((? and watched=true) or (? and interest=true) or (? and evaluation_public=true and hidden=false and (rating is not null or review is not null))) order by title limit 1000",actor,watched,watchlist,watched);
            for(var item:library){
                if(!watched){item.put("watched",false);item.put("rewatching",false);}
                if(!watchlist)item.put("interest",false);
                if(!watched||!Boolean.TRUE.equals(item.get("evaluation_public"))||Boolean.TRUE.equals(item.get("hidden"))){item.put("rating",null);item.put("review",null);item.put("spoiler",false);}
                item.remove("hidden");item.remove("evaluation_public");
            }
        }
        var ranking=new ArrayList<Map<String,Object>>();
        if(own||Boolean.TRUE.equals(visibility.get("ranking"))) {
            ranking.addAll(rankings.manualRanking(actor));
            ranking.addAll(rankings.seriesRanking(actor,!own));
        }
        return Map.of("profile",Map.of("username",profile.get("username"),"name",profile.get("name"),"bio",profile.get("bio"),"avatar",Objects.toString(profile.get("avatar"),"")),"library",library,"viewings",diary.items(),"diaryHasMore",diary.hasMore(),"ranking",ranking,"visibility",visibility);
    }
}
