package br.com.cenaaberta;

import java.time.*;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.*;

/** Biblioteca do usuário: assistido, Vou ver, rever, nota, visibilidade e resenha. */
@RestController
public class Library {

    public record LibraryChange(Boolean value,Integer rating,String review,Boolean spoiler,Integer version) {}

    private final JdbcTemplate db;
    private final ActiveActors actors;
    private final LibraryEntries entries;
    private final Diary diary;

    Library(JdbcTemplate db,ActiveActors actors,LibraryEntries entries,Diary diary) {
        this.db=db; this.actors=actors; this.entries=entries; this.diary=diary;
    }

    @PutMapping("/me/library/{id}/{action}")

    @Transactional

    Map<String,Object> library(@RequestHeader("X-Actor") String actor,@PathVariable String id,@PathVariable String action,@RequestBody LibraryChange input) {

        actors.lockActive(actor);

        entries.ensure(actor,id);

        var old=Rows.one(db,"select * from library where actor=? and title=?",actor,id);

        switch(action) {

            case "watched" -> {

                if (input.value()==null) fail(HttpStatus.BAD_REQUEST,"Informe o estado.");

                if (input.value()) {
                    entries.markWatched(actor,id);
                    if(!Rows.exists(db,"select count(*) from viewing where actor=? and title=?",actor,id)){
                        OffsetDateTime now=OffsetDateTime.now(DIARY_ZONE);
                        diary.insertViewing(actor,id,now.toLocalDate(),false,now);
                    }
                }

                else if (!input.value()) {

                    db.update("update library set watched=false,rewatching=false where actor=? and title=?",actor,id);

                    if(db.update("delete from film_ranking where actor=? and title=?",actor,id)>0)

                        db.update("update profile set ranking_version=ranking_version+1 where actor=?",actor);

                }

            }

            case "interest" -> {

                if (input.value()==null) fail(HttpStatus.BAD_REQUEST,"Informe o estado.");

                if(input.value() && Boolean.TRUE.equals(old.get("watched")))
                    fail(HttpStatus.CONFLICT,"A obra já está marcada como assistida.");
                db.update("update library set interest=? where actor=? and title=?",input.value(),actor,id);

            }

            case "rewatching" -> {

                if(input.value()==null) fail(HttpStatus.BAD_REQUEST,"Informe o estado.");

                db.update("update library set rewatching=? where actor=? and title=?",input.value(),actor,id);

                if(input.value()) entries.markWatched(actor,id);

            }

            case "rating" -> {
                if(entries.episodic(id))fail(HttpStatus.BAD_REQUEST,"Avalie os episódios para calcular a nota da série.");

                Integer value=input.rating();

                if (value!=null && (value<1 || value>10)) fail(HttpStatus.BAD_REQUEST,"Nota fora da escala.");

                // rated_at só muda quando a nota muda: reenviar a mesma nota não pode "subir" a obra no feed dos amigos.
                if(!Objects.equals(value,old.get("rating")))
                    db.update("update library set rating=?,rated_at=? where actor=? and title=?",value,value==null?null:OffsetDateTime.now(ZoneOffset.UTC),actor,id);

                if (value!=null) entries.markWatched(actor,id);

            }

            case "visibility" -> {
                if(input.value()==null)fail(HttpStatus.BAD_REQUEST,"Informe a visibilidade da avaliação.");
                db.update("update library set evaluation_public=? where actor=? and title=?",input.value(),actor,id);
            }
            case "review" -> {

                String review=optional(input.review(),3000);

                if (input.version()==null || !input.version().equals(old.get("version"))) {
                    boolean alreadySaved=input.version()!=null && input.version()==((Integer)old.get("version"))-1
                        && Objects.equals(review.isBlank()?null:review,old.get("review"))
                        && Objects.equals(Boolean.TRUE.equals(input.spoiler()),old.get("spoiler"));
                    if(alreadySaved)break;
                    fail(HttpStatus.CONFLICT,"Resenha alterada. Atualize a página.");
                }

                boolean textChanged=!Objects.equals(review.isBlank()?null:review,old.get("review"));
                db.update("update library set review=?,spoiler=?,version=version+1 where actor=? and title=?",review.isBlank()?null:review,Boolean.TRUE.equals(input.spoiler()),actor,id);
                // Texto novo invalida os votos de spoiler dados ao texto anterior (regra do alpha).
                if (textChanged) {
                    db.update("delete from review_spoiler_vote where author=? and title=?",actor,id);
                    // reviewed_at marca a última mudança de texto (ordem do feed); só trocar o spoiler não conta.
                    db.update("update library set reviewed_at=? where actor=? and title=?",review.isBlank()?null:OffsetDateTime.now(ZoneOffset.UTC),actor,id);
                }
                // Apagar a resenha apaga curtidas e comentários dela; editar o texto os mantém.
                if (review.isBlank() && old.get("review")!=null) {
                    db.update("delete from review_like where author=? and title=?",actor,id);
                    db.update("delete from review_comment where author=? and title=?",actor,id);
                }

                if (!review.isBlank() && old.get("review")==null) {

                    entries.markWatched(actor,id);

                    if (!Boolean.TRUE.equals(old.get("rewatching")) &&

                            !Rows.exists(db,"select count(*) from viewing where actor=? and title=?",actor,id)) {

                        OffsetDateTime watchedAt=OffsetDateTime.now(DIARY_ZONE);

                        diary.insertViewing(actor,id,watchedAt.toLocalDate(),false,watchedAt);

                    }

                }

            }

            default -> fail(HttpStatus.NOT_FOUND,"Ação desconhecida.");

        }

        return Rows.one(db,"select title,watched,interest,rewatching,rating,review,spoiler,hidden,version,evaluation_public from library where actor=? and title=?",actor,id);

    }
}
