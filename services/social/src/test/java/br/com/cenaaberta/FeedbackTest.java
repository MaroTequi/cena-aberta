package br.com.cenaaberta;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
class FeedbackTest {
 JdbcTemplate db;Feedback service;
 @BeforeEach void setup(){
 var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
 new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V3__profile_cpf_avatar.sql"),new ClassPathResource("db/migration/V13__feedback_admin.sql"),new ClassPathResource("db/migration/V2__email_accounts.sql"),new ClassPathResource("db/migration/V20__account_state.sql"),new ClassPathResource("db/migration/V21__feedback_images.sql"),new ClassPathResource("db/migration/V24__feedback_thanks_claim.sql"),new ClassPathResource("db/migration/V29__review_reports.sql")).execute(source);
 db=new JdbcTemplate(source);for(String a:List.of("admin","member"))db.update("insert into profile(actor,username,name) values(?,?,?)",a,a,a);
 db.update("insert into app_admin(actor) values('admin')");service=new Feedback(db);
 }
 private int feedbackReads(){
  return db.queryForObject("""
      select coalesce(sum(execution_count),0) from information_schema.query_statistics
      where lower(trim(sql_statement)) like 'select %' and lower(sql_statement) like '%from feedback%'
      and lower(sql_statement) not like '%information_schema%'
      """,Integer.class);
 }
 @Test void reviewReportsCanBeResolvedAndReopenedByAdmins(){
  String id=UUID.randomUUID().toString();
  db.update("insert into review_report(id,reporter,author,title,review_version,review_text,reason,details) values(?,?,?,?,?,?,?,?)",
      id,"member","admin","demo-mare-alta",1,"Resenha denunciada","spoiler","");
  assertThrows(ResponseStatusException.class,()->service.reviewReports("member",false,0));
  assertThrows(ResponseStatusException.class,()->service.resolveReviewReport("member",id,new Feedback.ReportResolution(true)));
  assertEquals(1,((List<?>)service.reviewReports("admin",false,0).get("items")).size());
  assertTrue(service.resolveReviewReport("admin",id,new Feedback.ReportResolution(true)).get("resolved"));
  assertEquals(List.of(),service.reviewReports("admin",false,0).get("items"));
  assertEquals(1,((List<?>)service.reviewReports("admin",true,0).get("items")).size());
  assertFalse(service.resolveReviewReport("admin",id,new Feedback.ReportResolution(false)).get("resolved"));
  assertEquals(1,((List<?>)service.reviewReports("admin",false,0).get("items")).size());
 }

 @Test void inboxReadsTwoQueriesForOneOrFiftyReports(){
  db.execute("SET QUERY_STATISTICS TRUE");
  var date=java.time.OffsetDateTime.now();
  for(int i=0;i<51;i++){
   String id=String.format("%03d",i);
   db.update("insert into feedback(id,actor,kind,description,page,app_version,created,status) values(?,'member','bug','Relato de teste','/','test',?,?)",
       id,date,i==0?"resolved":"new");
  }
  db.update("insert into feedback_thanks(feedback_id,state) values('000','sent')");
  for(String image:List.of("z","b","a"))
   db.update("insert into feedback_image(id,feedback_id,content,size_bytes,created) values(?,'001',?,1,?)",image,new byte[]{1},image.equals("z")?date.minusDays(1):date);
  int before=feedbackReads();
  var single=service.inbox("admin","resolved",0);
  assertEquals(2,feedbackReads()-before);
  var one=(List<Map<String,Object>>)single.get("items");
  assertEquals(1,one.size());assertEquals("sent",one.getFirst().get("thanks"));
  assertEquals(List.of(),one.getFirst().get("images"));assertEquals(false,single.get("hasMore"));
  before=feedbackReads();
  var full=service.inbox("admin","all",0);
  assertEquals(2,feedbackReads()-before);
  var first=(List<Map<String,Object>>)full.get("items");
  assertEquals(50,first.size());assertEquals(true,full.get("hasMore"));assertEquals("049",first.getLast().get("id"));
  assertEquals(List.of("z","a","b"),first.get(1).get("images"));assertEquals("none",first.get(1).get("thanks"));
  var next=service.inbox("admin","all",50);
  assertEquals("050",((List<Map<String,Object>>)next.get("items")).getFirst().get("id"));assertEquals(false,next.get("hasMore"));
  before=feedbackReads();
  assertEquals(List.of(),service.inbox("admin","reviewing",0).get("items"));
  assertEquals(1,feedbackReads()-before);
 }
 @Test void onlyAdminCanReadAndChangeReports(){
 String id=UUID.randomUUID().toString();var input=new Feedback.Submission(id,"bug","O cartaz não aparece","/salas","0.1.0-alpha");
 service.submit("member",input);service.submit("member",input);
 assertEquals(1,db.queryForObject("select count(*) from feedback",Integer.class));
 assertFalse(service.access("member").get("admin"));
 assertThrows(ResponseStatusException.class,()->service.inbox("member","all",0));
 assertThrows(ResponseStatusException.class,()->service.change("member",id,new Feedback.Change("resolved")));
 assertEquals(1,((List<?>)service.inbox("admin","new",0).get("items")).size());
 service.change("admin",id,new Feedback.Change("reviewing"));
 assertEquals("reviewing",db.queryForObject("select status from feedback",String.class));
 }
 @Test void rejectsSensitiveUrlAndLimitsReports(){
 assertThrows(ResponseStatusException.class,()->service.submit("member",new Feedback.Submission(UUID.randomUUID().toString(),"bug","Descrição válida aqui","/conta?token=secret","0.1")));
 for(int i=0;i<10;i++)service.submit("member",new Feedback.Submission(UUID.randomUUID().toString(),"suggestion","Uma sugestão de melhoria","/","0.1"));
 var e=assertThrows(ResponseStatusException.class,()->service.submit("member",new Feedback.Submission(UUID.randomUUID().toString(),"bug","Descrição válida aqui","/","0.1")));
 assertEquals(429,e.getStatusCode().value());
 }
 String image() throws Exception {var image=new java.awt.image.BufferedImage(30,30,java.awt.image.BufferedImage.TYPE_INT_RGB);var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"jpeg",out);return "data:image/jpeg;base64,"+Base64.getEncoder().encodeToString(out.toByteArray());}
 String report(List<String> images){String id=UUID.randomUUID().toString();service.submit("member",new Feedback.Submission(id,"bug","O cartaz não aparece","/salas","0.1",images));return id;}
 @Test void imagesArePrivateValidatedAndIdempotent() throws Exception {
  String value=image(),id=report(List.of(value,value,value,value));
  assertEquals(4,db.queryForObject("select count(*) from feedback_image",Integer.class));
  String imageId=db.queryForList("select id from feedback_image",String.class).getFirst();
  assertThrows(ResponseStatusException.class,()->service.image("member",id,imageId));
  assertEquals("image/jpeg",service.image("admin",id,imageId).getHeaders().getContentType().toString());
  assertThrows(ResponseStatusException.class,()->service.image("admin",UUID.randomUUID().toString(),imageId));
  service.submit("member",new Feedback.Submission(id,"bug","O cartaz não aparece","/salas","0.1",List.of(value)));
  assertEquals(4,db.queryForObject("select count(*) from feedback_image",Integer.class));
  assertThrows(ResponseStatusException.class,()->report(List.of(value,value,value,value,value)));
  assertThrows(ResponseStatusException.class,()->report(List.of("data:image/jpeg;base64,AAAA")));
  assertThrows(ResponseStatusException.class,()->report(List.of("data:image/svg+xml;base64,AAAA")));
  assertThrows(ResponseStatusException.class,()->report(List.of("data:image/jpeg;base64,"+"A".repeat(1_400_000))));
 }
 @Test void quotaEvictsOldestImagesAndPreservesReports() throws Exception {
  String value=image();int size=FeedbackImages.decode(List.of(value)).getFirst().length;service.imageLimit=size*2L;
  String oldest=report(List.of(value));db.update("update feedback_image set created=? where feedback_id=?",java.time.OffsetDateTime.now().minusDays(1),oldest);
  String recent=report(List.of(value)),last=report(List.of(value));
  assertEquals(0,db.queryForObject("select count(*) from feedback_image where feedback_id=?",Integer.class,oldest));
  assertEquals(2,db.queryForObject("select count(*) from feedback_image",Integer.class));
  assertEquals(3,db.queryForObject("select count(*) from feedback",Integer.class));
  assertEquals(size*2L,db.queryForObject("select sum(size_bytes) from feedback_image",Long.class));
  service.change("admin",recent,new Feedback.Change("resolved"));assertEquals(1,db.queryForObject("select count(*) from feedback_image",Integer.class));
  service.change("admin",recent,new Feedback.Change("resolved"));service.change("admin",recent,new Feedback.Change("reviewing"));service.change("admin",recent,new Feedback.Change("resolved"));
  assertEquals(1,db.queryForObject("select count(*) from feedback_thanks",Integer.class));
 }
 @Test void thanksRetryAndSkipDeletedAccounts() throws Exception {
  String id=report(List.of(image()));db.update("insert into email_account(actor,email,password_hash) values('member','member@example.test','unused')");service.change("admin",id,new Feedback.Change("resolved"));
  var mail=org.mockito.Mockito.mock(org.springframework.mail.javamail.JavaMailSender.class);var factory=new org.springframework.beans.factory.support.StaticListableBeanFactory();factory.addBean("mail",mail);
  var worker=new FeedbackThanks(db,factory.getBeanProvider(org.springframework.mail.javamail.JavaMailSender.class),"smtp","app@example.test");
  org.mockito.Mockito.doThrow(new org.springframework.mail.MailSendException("test",new java.net.ConnectException())).doNothing().when(mail).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
  worker.deliver();assertEquals("pending",db.queryForObject("select state from feedback_thanks",String.class));assertEquals(1,db.queryForObject("select attempts from feedback_thanks",Integer.class));
  db.update("update feedback_thanks set next_attempt=?",java.time.OffsetDateTime.now().minusMinutes(1));worker.deliver();worker.deliver();
  assertEquals("sent",db.queryForObject("select state from feedback_thanks",String.class));org.mockito.Mockito.verify(mail,org.mockito.Mockito.times(2)).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
  String deleted=report(List.of());service.change("admin",deleted,new Feedback.Change("resolved"));db.update("update email_account set state='deleted' where actor='member'");worker.deliver();assertEquals("skipped",db.queryForObject("select state from feedback_thanks where feedback_id=?",String.class,deleted));
 }

 @Test void slowSendHasNoDatabaseLockAndCrashRequiresReview() throws Exception {
  String id=report(List.of());
  db.update("insert into email_account(actor,email,password_hash) values('member','member@example.test','unused')");
  service.change("admin",id,new Feedback.Change("resolved"));
  var mail=org.mockito.Mockito.mock(org.springframework.mail.javamail.JavaMailSender.class);
  var factory=new org.springframework.beans.factory.support.StaticListableBeanFactory();
  factory.addBean("mail",mail);
  var worker=new FeedbackThanks(db,factory.getBeanProvider(org.springframework.mail.javamail.JavaMailSender.class),"smtp","app@example.test");
  var accepted=new java.util.concurrent.CountDownLatch(1);
  var release=new java.util.concurrent.CountDownLatch(1);
  org.mockito.Mockito.doAnswer(call->{
   accepted.countDown();
   if(!release.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new AssertionError("Tempo excedido");
   throw new Error("Processo interrompido após aceite simulado");
  }).when(mail).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
  try(var pool=java.util.concurrent.Executors.newSingleThreadExecutor()){
   var delivery=pool.submit(worker::deliver);
   try{
    assertTrue(accepted.await(5,java.util.concurrent.TimeUnit.SECONDS));
    assertEquals(1,db.update("update feedback_thanks set next_attempt=CURRENT_TIMESTAMP where feedback_id=?",id));
    worker.deliver();
   }finally{release.countDown();}
   assertInstanceOf(Error.class,assertThrows(java.util.concurrent.ExecutionException.class,delivery::get).getCause());
  }
  db.update("update feedback_thanks set claimed_at=? where feedback_id=?",java.time.OffsetDateTime.now().minusMinutes(11),id);
  worker.deliver();
  var item=((List<Map<String,Object>>)service.inbox("admin","all",0).get("items")).getFirst();
  assertEquals("uncertain",item.get("thanks"));
  var decision=new Feedback.Reconciliation((String)item.get("claim"),"sent");
  assertThrows(ResponseStatusException.class,()->service.reconcile("member",id,decision));
  service.reconcile("admin",id,decision);
  assertThrows(ResponseStatusException.class,()->service.reconcile("admin",id,decision));
  worker.deliver();
  org.mockito.Mockito.verify(mail).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
 }

 @Test void ambiguousFailureOnlyRetriesAfterManualDecision(){
  String id=report(List.of());
  db.update("insert into email_account(actor,email,password_hash) values('member','member@example.test','unused')");
  service.change("admin",id,new Feedback.Change("resolved"));
  var mail=org.mockito.Mockito.mock(org.springframework.mail.javamail.JavaMailSender.class);
  var factory=new org.springframework.beans.factory.support.StaticListableBeanFactory();
  factory.addBean("mail",mail);
  var worker=new FeedbackThanks(db,factory.getBeanProvider(org.springframework.mail.javamail.JavaMailSender.class),"smtp","app@example.test");
  org.mockito.Mockito.doThrow(new org.springframework.mail.MailSendException("Resposta SMTP perdida")).doNothing()
      .when(mail).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
  worker.deliver();
  worker.deliver();
  String claim=db.queryForObject("select claim_id from feedback_thanks where feedback_id=? and needs_review=true",String.class,id);
  service.reconcile("admin",id,new Feedback.Reconciliation(claim,"retry"));
  worker.deliver();
  assertEquals("sent",db.queryForObject("select state from feedback_thanks where feedback_id=?",String.class,id));
  org.mockito.Mockito.verify(mail,org.mockito.Mockito.times(2)).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
 }

 @Test void concurrentUploadsKeepQuota() throws Exception {
  String value=image();int size=FeedbackImages.decode(List.of(value)).getFirst().length;service.imageLimit=size;
  db.update("insert into profile(actor,username,name) values('another','another','another')");
  var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(db.getDataSource()));
  try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)){
   var start=new java.util.concurrent.CountDownLatch(1);var jobs=new java.util.ArrayList<java.util.concurrent.Future<?>>();
   for(String actor:List.of("member","another"))jobs.add(pool.submit(()->{try{start.await();tx.execute(status->{service.submit(actor,new Feedback.Submission(UUID.randomUUID().toString(),"bug","Descrição concorrente","/","0.1",List.of(value)));return null;});}catch(InterruptedException e){throw new RuntimeException(e);}}));
   start.countDown();for(var job:jobs)job.get(10,java.util.concurrent.TimeUnit.SECONDS);
  }
  assertEquals(1,db.queryForObject("select count(*) from feedback_image",Integer.class));assertEquals(2,db.queryForObject("select count(*) from feedback",Integer.class));
 }

}
