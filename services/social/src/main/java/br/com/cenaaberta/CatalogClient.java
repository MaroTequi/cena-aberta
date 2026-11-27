package br.com.cenaaberta;

import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import static br.com.cenaaberta.Guards.*;

/** Cliente HTTP do serviço de catálogo, autenticado pela chave interna. */
@Component
class CatalogClient implements TitleVerifier, CatalogSeasons, CatalogTitles {

    private final ObjectMapper mapper;
    private final String catalogKey, catalog;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    CatalogClient(ObjectMapper mapper,@Value("${CATALOG_INTERNAL_SECRET}") String key,
                  @Value("${CATALOG_URL:http://127.0.0.1:8181}") String url) {
        this.mapper=mapper; this.catalogKey=key; this.catalog=url;
        if (key.length()<24) throw new IllegalArgumentException("Chaves internas precisam de pelo menos 24 caracteres");
    }

    @Override
    public String verify(String id) {

        validateTitle(id);

        try {

            var response=http.send(HttpRequest.newBuilder(URI.create(catalog+"/titles/"+id)).timeout(Duration.ofSeconds(3))

                .header("X-Internal-Key",catalogKey).GET().build(),HttpResponse.BodyHandlers.ofString());

            int status=response.statusCode();

            if (status==404) fail(HttpStatus.NOT_FOUND,"Obra não encontrada.");

            if (status!=200) fail(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo indisponível.");

            return mapper.readTree(response.body()).path("format").asText();

        } catch (InterruptedException interrupted) {

            Thread.currentThread().interrupt(); fail(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida.");

        } catch (java.io.IOException failure) { fail(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo indisponível."); }

        throw new IllegalStateException("Catálogo indisponível.");

    }

    @Override
    public JsonNode season(String title,int season) {
        return inventory("/titles/"+title+"/seasons/"+season);
    }

    @Override
    public JsonNode seasons(String title) { return inventory("/titles/"+title+"/seasons"); }

    private JsonNode inventory(String path) {
        try {
            var response=http.send(HttpRequest.newBuilder(URI.create(catalog+path))
                .timeout(Duration.ofSeconds(5)).header("X-Internal-Key",catalogKey).GET().build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200)fail(response.statusCode()==404?HttpStatus.NOT_FOUND:HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível consultar os episódios.");
            return mapper.readTree(response.body());
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        } catch(java.io.IOException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    /** O catálogo aceita até 30 ids por chamada, então o lote é dividido. */
    @Override
    public Map<String,JsonNode> titles(Collection<String> ids,boolean details) {
        var unique=new ArrayList<>(new LinkedHashSet<>(ids));
        var result=new HashMap<String,JsonNode>();
        for(int start=0;start<unique.size();start+=30) {
            var chunk=unique.subList(start,Math.min(start+30,unique.size()));
            try {
                var response=http.send(HttpRequest.newBuilder(URI.create(catalog+"/title-batch?details="+details+"&ids="+String.join(",",chunk)))
                    .timeout(Duration.ofSeconds(25)).header("X-Internal-Key",catalogKey).GET().build(),HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()!=200)fail(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo indisponível.");
                for(JsonNode title:mapper.readTree(response.body()))result.put(title.path("id").asText(),title);
            } catch(InterruptedException e) {
                Thread.currentThread().interrupt();
                fail(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrompida.");
            } catch(java.io.IOException e) {
                fail(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo indisponível.");
            }
        }
        return result;
    }
}
