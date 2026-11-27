package br.com.cenaaberta;

import java.util.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/** Central de avisos: pedidos de amizade, convites e fim de sala, e recomendações não lidas. */
@RestController
public class Notifications {

    private final JdbcTemplate db;
    private final ActiveActors actors;

    Notifications(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    @GetMapping("/notifications")
    Map<String,Object> notifications(@RequestHeader("X-Actor") String actor) {
        actors.requireActive(actor);
        var items=db.queryForList("""
                select kind,target,label,sender,id,count(*) over() as total from (
                    select 'friend' as kind,p.username as target,p.name as label,p.name as sender,cast(null as varchar(36)) as id,f.created
                    from friendship f join profile p on p.actor=f.requester
                    where f.recipient=? and f.status='pending' and p.active=true
                    union all
                    select 'room',r.id,r.name,p.name,cast(null as varchar(36)),i.created
                    from movie_room_invitation i join movie_room r on r.id=i.room
                    join profile p on p.actor=i.sender
                    where i.recipient=? and p.active=true and r.status='lobby' and r.expires>CURRENT_TIMESTAMP
                    and not exists(select 1 from movie_room_member m where m.room=r.id and m.actor=i.recipient)
                    union all
                    select reason,room,name,'',cast(null as varchar(36)),visible_at from room_end_notice
                    where recipient=? and seen=false and visible_at<=CURRENT_TIMESTAMP
                    union all
                    select 'recommendation',rc.title,rc.title_name,p.name,rc.id,rc.created
                    from recommendation rc join profile p on p.actor=rc.sender
                    where rc.recipient=? and rc.seen=false and p.active=true
                ) notices order by created desc,kind,target,id limit 20
                """,actor,actor,actor,actor);
        long total=items.isEmpty()?0:((Number)items.getFirst().get("total")).longValue();
        items.forEach(row->row.remove("total"));
        return Map.of("items",items,"total",total);
    }

    @PutMapping("/notifications/rooms/{id}/read")
    Map<String,Boolean> readRoomNotice(@RequestHeader("X-Actor") String actor,@PathVariable String id){
        actors.requireActive(actor);
        db.update("update room_end_notice set seen=true where room=? and recipient=? and visible_at<=CURRENT_TIMESTAMP",id,actor);
        return Map.of("read",true);
    }
}
