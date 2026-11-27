package br.com.cenaaberta;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

/**
 * Exige a chave interna (X-Internal-Key) em qualquer rota do catálogo, exceto /health.
 * Fica num filtro, e não no controller, para que uma rota nova nasça protegida (mesmo desenho do social).
 */
@Component
class InternalKeyFilter extends OncePerRequestFilter {
    /**
     * Mensagem do corpo de erro igual à de antes do filtro: o controller lançava ResponseStatusException(401) sem motivo,
     * e o Spring Boot publicava o getMessage() dela ("401 UNAUTHORIZED") no campo "message".
     */
    static final String MESSAGE = new ResponseStatusException(HttpStatus.UNAUTHORIZED).getMessage();

    private final byte[] secret;

    /**
     * @param secret segredo compartilhado com o BFF e o social; precisa ter ao menos 24 caracteres
     */
    InternalKeyFilter(@Value("${internal.secret}") String secret) {
        if (secret == null || secret.length() < 24) throw new IllegalArgumentException("INTERNAL_SECRET precisa de pelo menos 24 caracteres");
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        if (request.getRequestURI().equals("/health")) { chain.doFilter(request, response); return; }
        String key = request.getHeader("X-Internal-Key");
        if (key == null || !MessageDigest.isEqual(secret, key.getBytes(StandardCharsets.UTF_8))) {
            response.sendError(401, MESSAGE);
            return;
        }
        chain.doFilter(request, response);
    }
}
