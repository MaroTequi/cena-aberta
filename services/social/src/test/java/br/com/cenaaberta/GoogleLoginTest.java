package br.com.cenaaberta;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Entrar com o Google: ligar à conta de mesmo e-mail, criar conta nova e respeitar o modo só por convite. */
class GoogleLoginTest {
    private JdbcTemplate db;

    @BeforeEach void setup() { db=TestDatabase.migrated(); }

    private EmailAccounts service(boolean inviteOnly,String invited) {
        var factory=new StaticListableBeanFactory();
        factory.addBean("mail",mock(JavaMailSender.class));
        return new EmailAccounts(db,factory.getBeanProvider(JavaMailSender.class),"disabled","http://localhost:3000","",inviteOnly,invited);
    }
    private static EmailAccounts.GoogleInput google(String subject,String email) { return new EmailAccounts.GoogleInput(subject,email,true); }
    private String existingAccount(String email) {
        String actor="account_"+UUID.randomUUID().toString().replace("-","");
        db.update("insert into email_account(actor,email,password_hash) values(?,?,?)",actor,email,"$2a$12$hash");
        return actor;
    }
    private int accounts() { return db.queryForObject("select count(*) from email_account",Integer.class); }

    @Test void shouldLinkGoogleToTheAccountWithTheSameEmail() {
        String actor=existingAccount("ana@example.test");
        var login=service(false,"").google(google("google-sub-1"," ANA@Example.test "));
        assertEquals(actor,login.id());
        assertEquals("ana@example.test",login.email());
        assertEquals(1,accounts(),"não cria conta nova");
        assertEquals(actor,db.queryForObject("select actor from google_identity where subject='google-sub-1'",String.class));
    }

    @Test void shouldKeepUsingTheLinkEvenIfTheGoogleEmailChanges() {
        String actor=existingAccount("ana@example.test");
        var accounts=service(false,"");
        accounts.google(google("google-sub-1","ana@example.test"));
        var later=accounts.google(google("google-sub-1","ana.nova@example.test"));
        assertEquals(actor,later.id());
        assertEquals(1,accounts());
    }

    @Test void shouldCreateANewAccountWithoutAKnownPassword() {
        var login=service(false,"").google(google("google-sub-2","bia@example.test"));
        assertTrue(login.id().startsWith("account_"));
        assertEquals(1,accounts());
        String hash=db.queryForObject("select password_hash from email_account where actor=?",String.class,login.id());
        assertTrue(hash.startsWith("$2"),"guarda um hash aleatório, nunca vazio");
        var error=assertThrows(ResponseStatusException.class,()->service(false,"").login(new EmailAccounts.Input("bia@example.test","",null)));
        assertEquals(401,error.getStatusCode().value());
    }

    @Test void shouldRespectInviteOnlyForNewAccountsButNotForExistingOnes() {
        var restricted=service(true,"convidada@example.test");
        var blocked=assertThrows(ResponseStatusException.class,()->restricted.google(google("sub-x","estranho@example.test")));
        assertEquals(403,blocked.getStatusCode().value());
        assertEquals(0,accounts());
        assertNotNull(restricted.google(google("sub-y","convidada@example.test")).id());
        String actor=existingAccount("antiga@example.test");
        assertEquals(actor,restricted.google(google("sub-z","antiga@example.test")).id(),"quem já tem conta entra mesmo sem convite");
    }

    @Test void shouldRefuseUnverifiedEmailsAndMissingIdentity() {
        var accounts=service(false,"");
        var unverified=assertThrows(ResponseStatusException.class,()->accounts.google(new EmailAccounts.GoogleInput("sub","ana@example.test",false)));
        assertEquals(403,unverified.getStatusCode().value());
        var missing=assertThrows(ResponseStatusException.class,()->accounts.google(new EmailAccounts.GoogleInput("sub","ana@example.test",null)));
        assertEquals(403,missing.getStatusCode().value());
        var noSubject=assertThrows(ResponseStatusException.class,()->accounts.google(google("  ","ana@example.test")));
        assertEquals(400,noSubject.getStatusCode().value());
        var badEmail=assertThrows(ResponseStatusException.class,()->accounts.google(google("sub","não é e-mail")));
        assertEquals(400,badEmail.getStatusCode().value());
        assertEquals(0,accounts());
    }

    @Test void shouldNotEnterADeletedAccountAndStartOverByEmail() {
        String actor=existingAccount("ana@example.test");
        var accounts=service(false,"");
        accounts.google(google("google-sub-1","ana@example.test"));
        db.update("update email_account set archived_email=email,email=null,state='deleted' where actor=?",actor);
        var again=accounts.google(google("google-sub-1","ana@example.test"));
        assertNotEquals(actor,again.id(),"a conta excluída não volta; nasce uma nova");
        assertEquals(again.id(),db.queryForObject("select actor from google_identity where subject='google-sub-1'",String.class));
    }

    @Test void shouldNotLinkTwoGoogleLoginsToTheSameAccount() {
        existingAccount("ana@example.test");
        var accounts=service(false,"");
        accounts.google(google("google-sub-1","ana@example.test"));
        var conflict=assertThrows(ResponseStatusException.class,()->accounts.google(google("google-sub-2","ana@example.test")));
        assertEquals(409,conflict.getStatusCode().value());
    }

    @Test void pausedAccountsCanStillSignInToReactivate() {
        String actor=existingAccount("ana@example.test");
        db.update("update email_account set state='paused' where actor=?",actor);
        assertEquals(actor,service(false,"").google(google("google-sub-1","ana@example.test")).id());
    }
}
