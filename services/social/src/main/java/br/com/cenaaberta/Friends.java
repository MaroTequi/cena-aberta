package br.com.cenaaberta;
import java.util.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController @RequestMapping("/friends")
public class Friends {
 record Invitation(String username) {} record Decision(String action) {}
 private final JdbcTemplate db;
 Friends(JdbcTemplate db){this.db=db;}
 @ModelAttribute void verify(HttpServletRequest request){
  String actor=request.getHeader("X-Actor");
  if(actor==null||db.queryForObject("select count(*) from profile where actor=? and active=true",Integer.class,actor)!=1)fail(HttpStatus.FORBIDDEN);
 }
 private void fail(HttpStatus status){throw new ResponseStatusException(status);}
 private Map<String,Object> person(Map<String,Object> row,String actor){
  var result=new LinkedHashMap<String,Object>();
  for(String field:List.of("username","name","avatar"))result.put(field,row.get(field));
  result.put("id",row.get("id"));
  result.put("relationship",row.get("id")==null?"none":"accepted".equals(row.get("status"))?"friends":actor.equals(row.get("requester"))?"outgoing":"incoming");return result;
 }
 @GetMapping Map<String,Object> list(@RequestHeader("X-Actor") String actor,@RequestParam(defaultValue="0") int offset){
  if(offset<0||offset>100000)fail(HttpStatus.BAD_REQUEST);
  var rows=db.queryForList("select f.id,f.status,f.requester,p.username,p.name,p.avatar from friendship f join profile p on p.actor=case when f.requester=? then f.recipient else f.requester end where (f.requester=? or f.recipient=?) and p.active=true order by f.created desc,f.id limit 51 offset ?",actor,actor,actor,offset);
  return Map.of("items",rows.stream().limit(50).map(r->person(r,actor)).toList(),"hasMore",rows.size()>50);
 }
 @GetMapping("/profile") Map<String,Object> profile(@RequestParam String username,@RequestParam(defaultValue="0") int offset){
  if(offset<0||offset>100000)fail(HttpStatus.BAD_REQUEST);
  var owners=db.queryForList("select actor from profile where username=? and active=true",String.class,username);
  if(owners.isEmpty())fail(HttpStatus.NOT_FOUND);
  String owner=owners.getFirst();
  var rows=db.queryForList("select p.username,p.name,p.avatar from friendship f join profile p on p.actor=case when f.requester=? then f.recipient else f.requester end where (f.requester=? or f.recipient=?) and f.status='accepted' and p.active=true order by p.username,f.id limit 51 offset ?",owner,owner,owner,offset);
  return Map.of("items",rows.stream().limit(50).toList(),"hasMore",rows.size()>50);
 }
 @GetMapping("/search") List<Map<String,Object>> search(@RequestHeader("X-Actor") String actor,@RequestParam String q){
  if(q==null||q.strip().length()<2||q.length()>80)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Digite pelo menos 2 caracteres.");
  String term="%"+q.strip().toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
  return db.queryForList("select p.username,p.name,p.avatar,f.id,f.status,f.requester from profile p left join friendship f on (f.requester=? and f.recipient=p.actor) or (f.recipient=? and f.requester=p.actor) where p.active=true and p.actor<>? and (lower(p.username) like ? escape '!' or lower(p.name) like ? escape '!') order by p.username limit 30",actor,actor,actor,term,term).stream().map(r->person(r,actor)).toList();
 }
 @GetMapping("/status") Map<String,Object> status(@RequestHeader("X-Actor") String actor,@RequestParam String username){
  var rows=db.queryForList("select p.username,p.name,p.avatar,f.id,f.status,f.requester from profile p left join friendship f on (f.requester=? and f.recipient=p.actor) or (f.recipient=? and f.requester=p.actor) where p.active=true and p.actor<>? and p.username=?",actor,actor,actor,username);
  if(rows.isEmpty())fail(HttpStatus.NOT_FOUND);return person(rows.getFirst(),actor);
 }
 @PostMapping @Transactional Map<String,String> invite(@RequestHeader("X-Actor") String actor,@RequestBody Invitation input){
  if(input.username()==null||input.username().length()>32)fail(HttpStatus.BAD_REQUEST);
  var people=db.queryForList("select actor from profile where username=? and active=true",String.class,input.username());
  if(people.isEmpty())fail(HttpStatus.NOT_FOUND);String target=people.getFirst();if(target.equals(actor))fail(HttpStatus.BAD_REQUEST);
  // Lock both profiles in the same order so simultaneous requests cannot create reverse duplicates.
  for(String id:new TreeSet<>(List.of(actor,target)))db.queryForList("select actor from profile where actor=? for update",id);
  var existing=db.queryForList("select id from friendship where (requester=? and recipient=?) or (requester=? and recipient=?)",String.class,actor,target,target,actor);
  if(!existing.isEmpty())return Map.of("id",existing.getFirst());
  if(db.queryForObject("select count(*) from friendship where requester=? and status='pending'",Integer.class,actor)>=50)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Você já tem 50 pedidos pendentes.");
  String id=UUID.randomUUID().toString();db.update("insert into friendship(id,requester,recipient) values(?,?,?)",id,actor,target);return Map.of("id",id);
 }
 @PutMapping("/{id}") @Transactional Map<String,String> decide(@RequestHeader("X-Actor") String actor,@PathVariable String id,@RequestBody Decision input){
  var rows=db.queryForList("select * from friendship where id=? for update",id);if(rows.isEmpty())fail(HttpStatus.NOT_FOUND);var row=rows.getFirst();
  boolean sender=actor.equals(row.get("requester")),receiver=actor.equals(row.get("recipient"));if(!sender&&!receiver)fail(HttpStatus.FORBIDDEN);
  boolean pending="pending".equals(row.get("status"));String action=input.action();
  if("accept".equals(action)&&receiver){db.update("update friendship set status='accepted' where id=?",id);return Map.of("status","accepted");}
  if(("decline".equals(action)&&receiver&&pending)||("cancel".equals(action)&&sender&&pending)||("remove".equals(action)&&!pending)){db.update("delete from friendship where id=?",id);return Map.of("status","removed");}
  fail(HttpStatus.CONFLICT);return Map.of();
 }
}
