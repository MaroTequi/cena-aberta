package br.com.cenaaberta;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.zip.*;

import org.apache.commons.csv.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static br.com.cenaaberta.Guards.DIARY_ZONE;

/** Exporta os dados do próprio usuário num ZIP de CSVs (UTF-8 com BOM, para o Excel abrir acentos certo). */
@RestController
public class Export {

    private final JdbcTemplate db;
    private final ActiveActors actors;

    Export(JdbcTemplate db,ActiveActors actors) { this.db=db; this.actors=actors; }

    /**
     * Gera o ZIP com biblioteca, diário, ranking, coleções, notas de episódios e streamings assinados.
     * @param actor usuário da sessão
     * @return application/zip com Content-Disposition attachment
     * @throws IOException se a escrita em memória falhar
     */
    @GetMapping("/me/export")
    @Transactional(readOnly=true)
    ResponseEntity<byte[]> export(@RequestHeader("X-Actor") String actor) throws IOException {
        actors.requireActive(actor);
        var buffer=new ByteArrayOutputStream();
        try(var zip=new ZipOutputStream(buffer,StandardCharsets.UTF_8)) {
            csv(zip,"biblioteca.csv",List.of("obra","assistida","vou_ver","revendo","nota","resenha","spoiler","avaliacao_publica","oculta","nota_em","resenha_em"),
                db.queryForList("select title,watched,interest,rewatching,rating,review,spoiler,evaluation_public,hidden,rated_at,reviewed_at from library where actor=? order by title",actor),
                List.of("title","watched","interest","rewatching","rating","review","spoiler","evaluation_public","hidden","rated_at","reviewed_at"));
            csv(zip,"diario.csv",List.of("id","obra","data","revisto","assistido_em","registrado_em"),
                db.queryForList("select id,title,watched_on,rewatch,watched_at,created from viewing where actor=? order by watched_on nulls last,created,id",actor),
                List.of("id","title","watched_on","rewatch","watched_at","created"));
            csv(zip,"ranking.csv",List.of("obra","categoria","posicao"),
                db.queryForList("select title,tier,position from film_ranking where actor=? order by tier,position",actor),
                List.of("title","tier","position"));
            csv(zip,"colecoes.csv",List.of("colecao_id","colecao","descricao","posicao","obra"),
                db.queryForList("select c.id,c.name,c.description,i.position,i.title from collection c left join collection_item i on i.collection_id=c.id where c.actor=? order by c.created,c.id,i.position",actor),
                List.of("id","name","description","position","title"));
            csv(zip,"episodios.csv",List.of("obra","temporada","episodio","nota"),
                db.queryForList("select title,season,episode,rating from episode_rating where actor=? order by title,season,episode",actor),
                List.of("title","season","episode","rating"));
            csv(zip,"streamings.csv",List.of("servico_tmdb"),
                db.queryForList("select provider from actor_provider where actor=? order by provider",actor),
                List.of("provider"));
        }
        String file="cena-aberta-"+LocalDate.now(DIARY_ZONE)+".zip";
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(file).build().toString())
            .body(buffer.toByteArray());
    }

    private static void csv(ZipOutputStream zip,String name,List<String> header,List<Map<String,Object>> rows,List<String> columns) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        var writer=new OutputStreamWriter(zip,StandardCharsets.UTF_8);
        writer.write('﻿');
        var printer=new CSVPrinter(writer,CSVFormat.DEFAULT.builder().setHeader(header.toArray(String[]::new)).build());
        for(var row:rows) {
            var values=new ArrayList<String>();
            for(String column:columns) values.add(cell(row.get(column)));
            printer.printRecord(values);
        }
        // Não fecha o printer: fecharia o ZIP inteiro junto.
        printer.flush();
        zip.closeEntry();
    }

    /** Formata a célula; texto livre (String) que começa com =,+,-,@ ganha um apóstrofo para a planilha não executá-lo como fórmula. */
    static String cell(Object value) {
        if(value==null) return "";
        if(value instanceof java.sql.Timestamp || value instanceof OffsetDateTime) return Rows.instant(value);
        if(value instanceof java.sql.Date) return Rows.date(value);
        if(value instanceof Boolean flag) return flag?"sim":"não";
        String text=value.toString();
        // Números (inclusive negativos) saem como estão: o apóstrofo só vale para texto livre.
        if(!(value instanceof String)) return text;
        return !text.isEmpty() && "=+-@\t\r".indexOf(text.charAt(0))>=0 ? "'"+text : text;
    }
}
