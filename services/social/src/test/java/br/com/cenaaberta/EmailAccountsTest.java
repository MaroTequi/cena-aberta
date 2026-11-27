package br.com.cenaaberta;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EmailAccountsTest {
    private JdbcTemplate db;
    private JavaMailSender mail;
    private final String address="guest@example.test";
    private final String password=UUID.randomUUID()+"Aa1!";

    @BeforeEach void setup() {
        var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__social.sql"),new ClassPathResource("db/migration/V2__email_accounts.sql"),new ClassPathResource("db/migration/V20__account_state.sql"),new ClassPathResource("db/migration/V22__reuse_deleted_account_email.sql")).execute(source);
        db=new JdbcTemplate(source);
        mail=mock(JavaMailSender.class);
    }

    private EmailAccounts service(boolean restricted,String invitations) {
        var factory=new StaticListableBeanFactory();
        factory.addBean("mail",mail);
        return new EmailAccounts(db,factory.getBeanProvider(JavaMailSender.class),
            "smtp","https://example.test","sender@example.test",restricted,invitations);
    }
    private String link(EmailAccounts accounts,String purpose,String email) {
        clearInvocations(mail);
        accounts.request(purpose,new EmailAccounts.Input(email,null,null));
        var message=ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(message.capture());
        assertEquals(email.strip().toLowerCase(java.util.Locale.ROOT),message.getValue().getTo()[0]);
        return message.getValue().getText().split("#"+purpose+"=")[1].split("\\s")[0];
    }
    private EmailAccounts.Input confirmation(String token) {return new EmailAccounts.Input(null,password,token);}
    private int accounts() {return db.queryForObject("select count(*) from email_account",Integer.class);}
    private void rejected(EmailAccounts service,String token) {
        var error=assertThrows(ResponseStatusException.class,()->service.confirm("register",confirmation(token)));
        assertEquals(400,error.getStatusCode().value());
        assertEquals(0,accounts());
    }

    @Test void invitedAddressMustVerifyAndTokenIsSingleUse() {
        var service=service(true," OTHER@example.test, GUEST@example.test ,guest@example.test");
        String token=link(service,"register"," GUEST@example.test ");
        assertEquals(0,accounts());
        assertEquals(address,service.confirm("register",confirmation(token)).email());
        assertEquals(1,accounts());
        assertThrows(ResponseStatusException.class,()->service.confirm("register",confirmation(token)));
    }
    @Test void outsiderReceivesNoLinkAndNoAccount() {
        service(true,address).request("register",new EmailAccounts.Input("outsider@example.test",null,null));
        verifyNoInteractions(mail);
        assertEquals(0,db.queryForObject("select count(*) from email_link",Integer.class));
        assertEquals(0,accounts());
    }
    @Test void emptyListFailsClosed() {
        service(true," , ").request("register",new EmailAccounts.Input(address,null,null));
        verifyNoInteractions(mail);
        assertEquals(0,accounts());
    }
    @Test void removedInvitationBlocksAlreadyIssuedToken() {
        String token=link(service(true,address),"register",address);
        rejected(service(true,"other@example.test"),token);
    }
    @Test void enablingRestrictionBlocksPreviouslyOpenRegistration() {
        String token=link(service(false,""),"register",address);
        rejected(service(true,""),token);
    }
    @Test void expiredInvitationCannotCreateAccount() {
        var service=service(true,address);
        String token=link(service,"register",address);
        db.update("update email_link set expires_at=DATEADD('HOUR',-1,CURRENT_TIMESTAMP)");
        rejected(service,token);
    }
    @Test void openModePreservesRegistration() {
        var service=service(false,"");
        service.confirm("register",confirmation(link(service,"register",address)));
        assertEquals(1,accounts());
    }
    @Test void removalDoesNotBlockExistingLoginOrPasswordReset() {
        var initial=service(true,address);
        initial.confirm("register",confirmation(link(initial,"register",address)));
        var restricted=service(true,"");
        assertEquals(address,restricted.login(new EmailAccounts.Input(address,password,null)).email());
        String token=link(restricted,"reset",address);
        String replacement=UUID.randomUUID()+"Aa1!";
        assertEquals(1,restricted.confirm("reset",new EmailAccounts.Input(null,replacement,token)).version());
        assertEquals(address,restricted.login(new EmailAccounts.Input(address,replacement,null)).email());
        assertThrows(ResponseStatusException.class,()->restricted.login(new EmailAccounts.Input(address,password,null)));
    }
    @Test void malformedConfigurationFailsWithoutDisclosingAddress() {
        var error=assertThrows(IllegalArgumentException.class,()->service(true,"invalid private address"));
        assertFalse(error.getMessage().contains("private address"));
    }
    @Test void passwordPolicyAppliesToRegistrationAndResetWithoutConsumingToken() {
        var service=service(true,address);
        String token=link(service,"register",address);
        for(String weak:new String[]{"Aa1!short","lowercase123!","UPPERCASE123!","NoDigitsHere!","NoSymbols1234"}) {
            var error=assertThrows(ResponseStatusException.class,()->service.confirm("register",new EmailAccounts.Input(null,weak,token)));
            assertEquals(400,error.getStatusCode().value());
            assertEquals(0,accounts());
        }
        service.confirm("register",confirmation(token));
        String reset=link(service,"reset",address);
        assertThrows(ResponseStatusException.class,()->service.confirm("reset",new EmailAccounts.Input(null,"NoSymbols1234",reset)));
        assertEquals(address,service.confirm("reset",new EmailAccounts.Input(null,"StrongPass12!",reset)).email());
    }
    @Test void unknownResetAddressReceivesGenericSuccessWithoutMailOrToken() {
        var service=service(false, "");
        assertDoesNotThrow(()->service.request("reset",new EmailAccounts.Input(address,null,null)));
        verifyNoInteractions(mail);
        assertEquals(0,db.queryForObject("select count(*) from email_link",Integer.class));
    }
    @Test void resetCooldownSurvivesServiceRestartAndExpiresAfterTwoMinutes() {
        var service=service(false, "");
        service.confirm("register",confirmation(link(service,"register",address)));
        link(service,"reset",address);
        db.update("update email_link set sent_at=DATEADD('SECOND',-70,CURRENT_TIMESTAMP) where purpose='reset'");
        clearInvocations(mail);
        var restarted=service(false, "");
        var error=assertThrows(ResponseStatusException.class,()->restarted.request("reset",new EmailAccounts.Input(address,null,null)));
        assertEquals(429,error.getStatusCode().value());
        assertTrue(Integer.parseInt(error.getHeaders().getFirst("Retry-After"))>0);
        verifyNoInteractions(mail);
        db.update("update email_link set sent_at=DATEADD('SECOND',-121,CURRENT_TIMESTAMP) where purpose='reset'");
        link(restarted,"reset",address);
    }
    @Test void smtpFailureIsReportedAndDoesNotBlockRetry() {
        var service=service(false, "");
        service.confirm("register",confirmation(link(service,"register",address)));
        doThrow(new org.springframework.mail.MailSendException("mock failure")).when(mail).send(any(SimpleMailMessage.class));
        var error=assertThrows(ResponseStatusException.class,()->service.request("reset",new EmailAccounts.Input(address,null,null)));
        assertEquals(503,error.getStatusCode().value());
        assertEquals(0,db.queryForObject("select count(*) from email_link where purpose='reset'",Integer.class));
        doNothing().when(mail).send(any(SimpleMailMessage.class));
        link(service,"reset",address);
    }
    @Test void pauseResumeAndLogicalDeletionPreserveDataAndRevokeSessions() {
        var service=service(false,"");
        var login=service.confirm("register",confirmation(link(service,"register",address)));
        String actor=login.id();
        db.update("insert into profile(actor,username,name) values(?,?,?)",actor,"guest","Guest");
        db.update("insert into library(actor,title,watched) values(?,?,true)",actor,"demo-film");
        assertThrows(ResponseStatusException.class,()->service.manage(actor,new EmailAccounts.AccountChange("pause","wrong")));
        assertEquals("active",service.management(actor).get("state"));
        service.manage(actor,new EmailAccounts.AccountChange("pause",password));
        assertEquals("paused",service.management(actor).get("state"));
        assertFalse(db.queryForObject("select active from profile where actor=?",Boolean.class,actor));
        assertThrows(ResponseStatusException.class,()->service.session(actor,login.version()));
        var paused=service.login(new EmailAccounts.Input(address,password,null));
        service.manage(actor,new EmailAccounts.AccountChange("resume",password));
        assertTrue(db.queryForObject("select active from profile where actor=?",Boolean.class,actor));
        assertThrows(ResponseStatusException.class,()->service.session(actor,paused.version()));
        String reset=link(service,"reset",address);
        service.manage(actor,new EmailAccounts.AccountChange("delete",password));
        assertEquals("deleted",db.queryForObject("select state from email_account where actor=?",String.class,actor));
        assertEquals(1,db.queryForObject("select count(*) from library where actor=?",Integer.class,actor));
        assertThrows(ResponseStatusException.class,()->service.login(new EmailAccounts.Input(address,password,null)));
        assertThrows(ResponseStatusException.class,()->service.confirm("reset",confirmation(reset)));
        assertThrows(ResponseStatusException.class,()->service.manage(actor,new EmailAccounts.AccountChange("resume",password)));
        clearInvocations(mail);
        service.request("reset",new EmailAccounts.Input(address,null,null));
        verifyNoInteractions(mail);
        var replacementPassword=UUID.randomUUID()+"Aa1!";
        var fresh=service.confirm("register",new EmailAccounts.Input(null,replacementPassword,link(service,"register",address)));
        assertNotEquals(actor,fresh.id());
        assertEquals(fresh.id(),service.login(new EmailAccounts.Input(address,replacementPassword,null)).id());
        assertThrows(ResponseStatusException.class,()->service.login(new EmailAccounts.Input(address,password,null)));
        assertThrows(ResponseStatusException.class,()->service.session(actor,login.version()));
        assertThrows(ResponseStatusException.class,()->service.confirm("reset",confirmation(reset)));
        assertEquals(0,db.queryForObject("select count(*) from library where actor=?",Integer.class,fresh.id()));
        assertEquals(0,db.queryForObject("select count(*) from profile where actor=?",Integer.class,fresh.id()));
        assertEquals(1,db.queryForObject("select count(*) from library where actor=?",Integer.class,actor));
        assertEquals(fresh.id(),service.confirm("reset",confirmation(link(service,"reset",address))).id());
    }
}
