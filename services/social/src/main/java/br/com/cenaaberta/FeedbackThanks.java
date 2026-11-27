package br.com.cenaaberta;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
@Component @EnableScheduling
class FeedbackThanks {
 private final JdbcTemplate db;private final JavaMailSender mail;private final String mode,from;
 FeedbackThanks(JdbcTemplate db,ObjectProvider<JavaMailSender> mail,@Value("${EMAIL_MODE:disabled}") String mode,@Value("${MAIL_FROM:}") String from){this.db=db;this.mail=mail.getIfAvailable();this.mode=mode;this.from=from;}
 @Scheduled(fixedDelay=60000,initialDelay=60000)
 public void deliver(){
  db.update("update feedback_thanks set needs_review=true where state='pending' and claim_id is not null and needs_review=false and claimed_at<?",
      java.time.OffsetDateTime.now().minusMinutes(10));
  if(!"smtp".equals(mode)||mail==null||from.isBlank())return;
  var ids=db.queryForList("""
      select feedback_id from feedback_thanks where state='pending' and claim_id is null and needs_review=false
      and next_attempt<=CURRENT_TIMESTAMP order by next_attempt,feedback_id limit 10
      """,String.class);
  for(String id:ids) deliverOne(id);
 }

 private void deliverOne(String id){
  String claim=java.util.UUID.randomUUID().toString();
  int reserved=db.update("""
      update feedback_thanks set claim_id=?,claimed_at=CURRENT_TIMESTAMP,attempts=attempts+1
      where feedback_id=? and state='pending' and claim_id is null and needs_review=false and next_attempt<=CURRENT_TIMESTAMP
      """,claim,id);
  if(reserved==0)return;
  var addresses=db.queryForList("select a.email from email_account a join feedback f on f.actor=a.actor where f.id=? and a.state<>'deleted'",String.class,id);
  if(addresses.isEmpty()){
   db.update("update feedback_thanks set state='skipped',claim_id=null,needs_review=false where feedback_id=? and claim_id=?",id,claim);
   return;
  }
  var message=new SimpleMailMessage();message.setFrom(from);message.setTo(addresses.getFirst());message.setSubject("Seu relato ajudou a melhorar o Cena Aberta");message.setText("Olá!\n\nO problema que você reportou foi marcado como resolvido pela nossa equipe. Obrigado por ajudar a melhorar o Cena Aberta!\n\nOs anexos desse relato foram removidos. Se o problema continuar, envie um novo feedback pelo app.\n\nEquipe Cena Aberta");
  try{
   mail.send(message);
  }catch(org.springframework.mail.MailException failure){
   if(definitelyRejected(failure)){
    int attempt=db.queryForObject("select attempts from feedback_thanks where feedback_id=?",Integer.class,id);
    var retry=java.time.OffsetDateTime.now().plusMinutes(Math.min(1440L,5L*(1L<<Math.min(attempt,9))));
    db.update("update feedback_thanks set claim_id=null,needs_review=false,next_attempt=? where feedback_id=? and claim_id=?",retry,id,claim);
   }else{
    db.update("update feedback_thanks set needs_review=true where feedback_id=? and claim_id=?",id,claim);
   }
   return;
  }
  db.update("update feedback_thanks set state='sent',sent_at=CURRENT_TIMESTAMP,claim_id=null,needs_review=false where feedback_id=? and claim_id=?",id,claim);
 }

 private boolean definitelyRejected(Throwable failure){
  if(failure instanceof org.springframework.mail.MailAuthenticationException)return true;
  if(failure instanceof org.springframework.mail.MailSendException send && send.getMessageExceptions().length==1)
   failure=send.getMessageExceptions()[0];
  for(Throwable cause=failure;cause!=null;cause=cause.getCause()){
   if(cause instanceof java.net.ConnectException || cause instanceof java.net.UnknownHostException)return true;
   if(cause instanceof org.eclipse.angus.mail.smtp.SMTPAddressFailedException address)
    return address.getReturnCode()>=400 && address.getReturnCode()<600;
   if(cause instanceof org.eclipse.angus.mail.smtp.SMTPSendFailedException smtp)
    return smtp.getReturnCode()>=400 && smtp.getReturnCode()<600;
  }
  return false;
 }
}
