package br.com.cenaaberta;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;

import com.fasterxml.jackson.databind.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Cliente HTTP do TMDB: falhas viram 404 ou 503 com mensagem em português, nunca 500. */
@Component
class TmdbClient {

    private final ObjectMapper mapper;

    private final String token;

    private final String apiBase;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    TmdbClient(ObjectMapper mapper, @Value("${TMDB_TOKEN:}") String token,
               @Value("${tmdb.api-base:https://api.themoviedb.org/3}") String apiBase) {
        this.mapper = mapper; this.token = token.trim(); this.apiBase = apiBase;
    }

    /** Diz se o catálogo está em modo demo, isto é, sem TMDB_TOKEN configurado. */
    boolean demo() { return token.isBlank(); }

    /** GET no TMDB (caminho relativo à api-base, com language=pt-BR) e devolve o JSON da resposta. */
    JsonNode remote(String path) {

        try {

            String separator = path.contains("?") ? "&" : "?";

            var response = http.send(HttpRequest.newBuilder(URI.create(apiBase + path + separator + "language=pt-BR"))

                .timeout(Duration.ofSeconds(3)).header("Authorization","Bearer " + token).GET().build(),HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND);

            if (response.statusCode() == 401 || response.statusCode() == 403)

                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"O acesso ao TMDB precisa ser configurado.");

            if (response.statusCode() == 429)

                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"O TMDB limitou as consultas. Tente novamente em instantes.");

            if (response.statusCode() != 200) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo externo indisponível.");

            return mapper.readTree(response.body());

        } catch (InterruptedException interrupted) {

            Thread.currentThread().interrupt();

            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida.");

        } catch (java.io.IOException failure) {

            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo externo indisponível.");

        }

    }
}
