package br.com.cenaaberta;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import jakarta.mail.internet.InternetAddress;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/accounts")
class EmailAccounts {
    record Input(String email,String password,String token) {}
    record Login(String id,int version,String email) {}
    private final JdbcTemplate db;
    private final JavaMailSender mail;
    private final BCryptPasswordEncoder encoder=new BCryptPasswordEncoder(12);
    private final SecureRandom random=new SecureRandom();
    private final String dummy=encoder.encode(UUID.randomUUID().toString());
    private final String mode, front, from;
    private final boolean inviteOnly;
    private final Set<String> invitedEmails;
    private long minute;
    private int requests;

    EmailAccounts(JdbcTemplate db,ObjectProvider<JavaMailSender> mail,
        @Value("${EMAIL_MODE:disabled}") String mode,
        @Value("${FRONTEND_URL:http://localhost:3000}") String front,@Value("${MAIL_FROM:}") String from,
        @Value("${INVITE_ONLY:false}") boolean inviteOnly,@Value("${INVITED_EMAILS:}") String invitedEmails) {
        this.db=db; this.mail=mail.getIfAvailable();
        this.mode=mode; this.front=front.replaceAll("/$",""); this.from=from;
        this.inviteOnly=inviteOnly;
        var invitations=new HashSet<String>();
        for(String entry:invitedEmails.split(",")) {
            if(entry.isBlank()) continue;
            try { invitations.add(email(entry)); }
            catch(ResponseStatusException invalid) { throw new IllegalArgumentException("INVITED_EMAILS contém um e-mail inválido"); }
        }
        this.invitedEmails=Set.copyOf(invitations);
        if (!Set.of("disabled","log","smtp").contains(mode)) throw new IllegalArgumentException("EMAIL_MODE inválido");
        if (!mode.equals("disabled")) {
            URI url=URI.create(front);
            boolean local=Set.of("localhost","127.0.0.1").contains(Objects.toString(url.getHost(),""));
            if (url.getHost()==null || url.getRawUserInfo()!=null || url.getRawQuery()!=null || url.getRawFragment()!=null ||
                (!"https".equals(url.getScheme()) && !(local && "http".equals(url.getScheme()))) ||
                (mode.equals("log") && !local) || (mode.equals("smtp") && (this.mail==null || from.isBlank())))
                throw new IllegalArgumentException("Confira FRONTEND_URL, MAIL_FROM e SMTP_HOST");
        }
    }

    @PostMapping("/{purpose:register|reset}")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void request(@PathVariable String purpose,@RequestBody Input input) {
        if(mode.equals("disabled")) throw error(HttpStatus.SERVICE_UNAVAILABLE,"Envio de e-mail indisponível.");
        limit();
        String email=email(input.email());
        if(purpose.equals("register") && !canRegister(email)) return;
        var existing=account(email);
        boolean reset=purpose.equals("reset");
        if(reset!=existing.isPresent())return;
        String resetActor=existing.map(Login::id).orElse(null);
        var now=OffsetDateTime.now(ZoneOffset.UTC);
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String hash=hash(token);
        int changed=db.update("update email_link set reset_actor=?,token_hash=?,sent_at=?,expires_at=? where email=? and purpose=? and sent_at<=?",
            resetActor,hash,now,now.plusMinutes(60),email,purpose,now.minusMinutes(purpose.equals("reset")?2:1));
        if(changed==0) {
            try {
                db.update("insert into email_link(email,purpose,token_hash,sent_at,expires_at,reset_actor) values(?,?,?,?,?,?)",
                    email,purpose,hash,now,now.plusMinutes(60),resetActor);
            } catch(DuplicateKeyException cooldown) {
                if(purpose.equals("reset")) {
                    var sent=db.queryForObject("select sent_at from email_link where email=? and purpose=?",(row,index)->row.getTimestamp(1).toInstant(),email,purpose);
                    long seconds=sent==null?120:Math.max(1,Math.min(120,(java.time.Duration.between(java.time.Instant.now(),sent.plusSeconds(120)).toMillis()+999)/1000));
                    throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Aguarde antes de reenviar o link.") {
                        @Override public org.springframework.http.HttpHeaders getHeaders() {
                            var headers=new org.springframework.http.HttpHeaders();headers.set("Retry-After",Long.toString(seconds));return headers;
                        }
                    };
                }
                return;
            }
        }
        try {
            send(email,purpose,front+"/conta#"+purpose+"="+token);
        } catch(MailException failure) {
            db.update("delete from email_link where token_hash=?",hash);
            LoggerFactory.getLogger(getClass()).warn("Falha no envio SMTP: {}",failure.getClass().getSimpleName());
            throw error(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível enviar o e-mail. Tente novamente em instantes.");
        }
    }

    @PostMapping("/{purpose:register|reset}/confirm")
    @Transactional
    Login confirm(@PathVariable String purpose,@RequestBody Input input) {
        limit();
        String token=input.token();
        if(token==null || !token.matches("[A-Za-z0-9_-]{43}")) throw invalid();
        String tokenHash=hash(token);
        var candidate=db.queryForList("select email,reset_actor from email_link where token_hash=? and purpose=? and expires_at>CURRENT_TIMESTAMP",tokenHash,purpose);
        if(candidate.isEmpty()) throw invalid();
        String password=input.password();
        if(password==null || password.codePointCount(0,password.length())<12 || password.getBytes(StandardCharsets.UTF_8).length>72 || !password.codePoints().anyMatch(Character::isUpperCase) || !password.codePoints().anyMatch(Character::isLowerCase) || !password.codePoints().anyMatch(Character::isDigit) || !password.codePoints().anyMatch(c -> !Character.isLetterOrDigit(c) && !Character.isWhitespace(c)))
            throw error(HttpStatus.BAD_REQUEST,"Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo (máximo de 72 bytes).");
        String encoded=encoder.encode(password);
        String resetActor=(String)candidate.getFirst().get("reset_actor");
        if(purpose.equals("reset") && db.queryForList("select actor from email_account where actor=? and email=? and state<>'deleted' for update",
                resetActor,candidate.getFirst().get("email")).isEmpty())throw invalid();
        var rows=db.queryForList("select email from email_link where token_hash=? and purpose=? and expires_at>CURRENT_TIMESTAMP for update",tokenHash,purpose);
        if(rows.isEmpty()) throw invalid();
        String email=(String)rows.getFirst().get("email");
        if(purpose.equals("register")) {
            if(!canRegister(email)) throw invalid();
            try { db.update("insert into email_account(actor,email,password_hash) values(?,?,?)","account_"+UUID.randomUUID().toString().replace("-",""),email,encoded); }
            catch(DuplicateKeyException duplicate) { throw invalid(); }
        } else if(db.update("update email_account set password_hash=?,session_version=session_version+1 where actor=? and email=?",encoded,resetActor,email)!=1) throw invalid();
        db.update("delete from email_link where token_hash=?",tokenHash);
        return account(email).orElseThrow(EmailAccounts::invalid);
    }

    @PostMapping("/login")
    Login login(@RequestBody Input input) {
        limit();
        String email=email(input.email());
        var rows=db.queryForList("select actor,password_hash,session_version from email_account where email=? and state<>'deleted'",email);
        var row=rows.isEmpty()?Map.<String,Object>of():rows.getFirst();
        String password=input.password();
        if(password==null || password.getBytes(StandardCharsets.UTF_8).length>72 ||
           !encoder.matches(password,(String)row.getOrDefault("password_hash",dummy)) || row.isEmpty())
            throw error(HttpStatus.UNAUTHORIZED,"E-mail ou senha inválidos.");
        return new Login((String)row.get("actor"),(Integer)row.get("session_version"),email);
    }

    /**
     * Pessoa que entrou pelo Google (o site só chama depois de o Google confirmar a identidade).
     * @param subject identificador fixo da pessoa no Google ("sub")
     * @param email e-mail da conta Google
     * @param emailVerified se o Google confirmou que o e-mail é dela
     */
    record GoogleInput(String subject,String email,Boolean emailVerified) {}

    /**
     * Entrada pelo Google. Já ligada: entra na mesma conta. Sem ligação, mas com conta de mesmo e-mail: liga e entra
     * (o e-mail precisa estar verificado pelo Google). Sem conta: cria uma, respeitando o modo só por convite.
     * A conta criada assim não tem senha conhecida; para usar e-mail e senha, a pessoa define uma em "Esqueci a senha".
     */
    @PostMapping("/google") @Transactional
    Login google(@RequestBody GoogleInput input) {
        limit();
        String subject=input.subject()==null?"":input.subject().strip();
        if(subject.isEmpty()||subject.length()>255) throw error(HttpStatus.BAD_REQUEST,"Identidade do Google inválida.");
        if(!Boolean.TRUE.equals(input.emailVerified())) throw error(HttpStatus.FORBIDDEN,"Confirme o e-mail na sua conta Google antes de entrar.");
        String email=email(input.email());
        var linked=db.queryForList("select a.actor,a.session_version,a.email from google_identity g join email_account a on a.actor=g.actor where g.subject=? and a.state<>'deleted'",subject);
        if(!linked.isEmpty()) {
            var row=linked.getFirst();
            return new Login((String)row.get("actor"),(Integer)row.get("session_version"),(String)row.get("email"));
        }
        // Ligação antiga para uma conta excluída não vale mais: a pessoa começa de novo pelo e-mail.
        db.update("delete from google_identity where subject=?",subject);
        var existing=account(email);
        if(existing.isEmpty()) {
            if(!canRegister(email)) throw error(HttpStatus.FORBIDDEN,"O cadastro está aberto só para convidados.");
            try { db.update("insert into email_account(actor,email,password_hash) values(?,?,?)","account_"+UUID.randomUUID().toString().replace("-",""),email,encoder.encode(unknownPassword())); }
            catch(DuplicateKeyException concurrent) { /* outra entrada criou a conta ao mesmo tempo; usa a que existe */ }
            existing=account(email);
        }
        var login=existing.orElseThrow(()->error(HttpStatus.CONFLICT,"Não foi possível preparar a conta. Tente novamente."));
        var state=db.queryForList("select state from email_account where actor=?",String.class,login.id());
        if(state.isEmpty()||"deleted".equals(state.getFirst())) throw error(HttpStatus.CONFLICT,"Conta indisponível.");
        try { db.update("insert into google_identity(subject,actor) values(?,?)",subject,login.id()); }
        catch(DuplicateKeyException other) { throw error(HttpStatus.CONFLICT,"Esta conta já está ligada a outro login do Google."); }
        return login;
    }

    @GetMapping("/session")
    void session(@RequestHeader("X-Actor") String actor,@RequestParam int version) {
        Integer count=db.queryForObject("select count(*) from email_account where actor=? and session_version=? and state<>'deleted'",Integer.class,actor,version);
        if(count==null || count!=1) throw error(HttpStatus.UNAUTHORIZED,"Sessão inválida.");
    }

    record AccountChange(String action,String password) {}
    @GetMapping("/management")
    Map<String,String> management(@RequestHeader("X-Actor") String actor) {
        var rows=db.queryForList("select state from email_account where actor=? and state<>'deleted'",String.class,actor);
        if(rows.isEmpty())throw error(HttpStatus.NOT_FOUND,"Conta indisponível.");
        return Map.of("state",rows.getFirst());
    }
    @PostMapping("/management") @Transactional
    Map<String,String> manage(@RequestHeader("X-Actor") String actor,@RequestBody AccountChange input) {
        limit();
        if(input.action()==null||!Set.of("pause","resume","delete").contains(input.action()))throw error(HttpStatus.BAD_REQUEST,"Ação inválida.");
        var rows=db.queryForList("select email,password_hash,state from email_account where actor=? for update",actor);
        if(rows.isEmpty()||"deleted".equals(rows.getFirst().get("state")))throw error(HttpStatus.NOT_FOUND,"Conta indisponível.");
        var row=rows.getFirst();String password=input.password();
        if(password==null||password.getBytes(StandardCharsets.UTF_8).length>72||!encoder.matches(password,(String)row.get("password_hash")))throw error(HttpStatus.UNAUTHORIZED,"Senha incorreta.");
        String previous=(String)row.get("state");
        String next=switch(input.action()){case "pause"->"paused";case "resume"->"active";default->"deleted";};
        if(next.equals(previous))return Map.of("state",next);
        if(input.action().equals("resume")&&!previous.equals("paused"))throw error(HttpStatus.CONFLICT,"A conta não está pausada.");
        var profiles=db.queryForList("select active from profile where actor=? for update",Boolean.class,actor);
        if(input.action().equals("pause")&&(profiles.isEmpty()||!profiles.getFirst()))throw error(HttpStatus.CONFLICT,"Conta indisponível para pausa.");
        if(next.equals("deleted")) {
            db.update("update email_account set archived_email=email,email=null,state='deleted',state_changed_at=CURRENT_TIMESTAMP,session_version=session_version+1 where actor=?",actor);
            db.update("delete from email_link where email=?",row.get("email"));
        } else {
            db.update("update email_link set expires_at=CURRENT_TIMESTAMP where email=?",row.get("email"));
            db.update("update email_account set state=?,state_changed_at=CURRENT_TIMESTAMP,session_version=session_version+1 where actor=?",next,actor);
        }
        db.update("update profile set active=? where actor=?",next.equals("active"),actor);
        return Map.of("state",next);
    }

    private Optional<Login> account(String email) {
        return db.query("select actor,session_version from email_account where email=?",
            (r,i)->new Login(r.getString("actor"),r.getInt("session_version"),email),email).stream().findFirst();
    }

    /** Senha aleatória que ninguém conhece (43 caracteres, dentro do limite de 72 bytes do BCrypt). */
    private String unknownPassword() {
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private boolean canRegister(String email) {
        return !inviteOnly || invitedEmails.contains(email);
    }

    private void send(String email,String purpose,String link) {
        if(mode.equals("log")) {
            LoggerFactory.getLogger(getClass()).info("Link local de {}: {}",purpose,link);
            return;
        }
        SimpleMailMessage message=new SimpleMailMessage();
        message.setFrom(from); message.setTo(email);
        message.setSubject(purpose.equals("register")?"Confirme sua conta no Cena Aberta":"Redefina sua senha do Cena Aberta");
        message.setText("Abra este link para definir sua senha:\n"+link+"\n\nEle expira em uma hora. Se você não solicitou, ignore esta mensagem.");
        mail.send(message);
    }

    private synchronized void limit() {
        long now=System.currentTimeMillis()/60000;
        if(now!=minute) {minute=now;requests=0;}
        if(++requests>100) throw error(HttpStatus.TOO_MANY_REQUESTS,"Muitas tentativas. Aguarde um minuto.");
    }

    private static String email(String raw) {
        String value=raw==null?"":raw.strip().toLowerCase(Locale.ROOT);
        try {
            InternetAddress parsed=new InternetAddress(value,true);
            parsed.validate();
            if(value.length()<=254 && value.equals(parsed.getAddress()) && !parsed.isGroup()) return value;
        } catch(jakarta.mail.internet.AddressException ignored) {}
        throw error(HttpStatus.BAD_REQUEST,"Informe um e-mail válido.");
    }

    private static String hash(String token) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException impossible) {throw new IllegalStateException(impossible);}
    }
    private static ResponseStatusException invalid() {return error(HttpStatus.BAD_REQUEST,"Link inválido ou expirado. Solicite outro.");}
    private static ResponseStatusException error(HttpStatus status,String message) {return new ResponseStatusException(status,message);}
}
