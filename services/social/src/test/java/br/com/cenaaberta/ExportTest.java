package br.com.cenaaberta;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class ExportTest {
    static final String ANA="ana-12345678",BIA="bia-12345678";
    JdbcTemplate db; Export service;

    @BeforeEach void setup() { db=TestDatabase.migrated(); TestDatabase.profile(db,ANA); TestDatabase.profile(db,BIA); service=new Export(db,new ActiveActors(db)); }

    Map<String,String> unzip(byte[] bytes) throws IOException {
        var files=new LinkedHashMap<String,String>();
        try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes),StandardCharsets.UTF_8)) {
            for(ZipEntry entry;(entry=zip.getNextEntry())!=null;) files.put(entry.getName(),new String(zip.readAllBytes(),StandardCharsets.UTF_8));
        }
        return files;
    }

    @Test void zipHasFiveCsvsWithBomOnlyWithOwnData() throws IOException {
        db.update("insert into library(actor,title,watched,rating,review) values(?,'demo-a',true,8,'=HYPERLINK(\"x\")'),(?,'demo-b',true,2,'da Bia')",ANA,BIA);
        db.update("insert into viewing(id,actor,title,watched_on,rewatch) values('v1',?,'demo-a',date '2025-01-02',false)",ANA);
        db.update("insert into collection(id,actor,name,description) values('c1',?,'Ação, \"top\"','')",ANA);
        db.update("insert into collection_item(collection_id,title,position) values('c1','demo-a',0)");
        var response=service.export(ANA);
        assertEquals("application/zip",response.getHeaders().getContentType().toString());
        assertTrue(response.getHeaders().getContentDisposition().isAttachment());
        assertTrue(response.getHeaders().getContentDisposition().getFilename().matches("cena-aberta-\\d{4}-\\d{2}-\\d{2}\\.zip"));
        var files=unzip(response.getBody());
        assertEquals(List.of("biblioteca.csv","diario.csv","ranking.csv","colecoes.csv","episodios.csv"),new ArrayList<>(files.keySet()));
        files.values().forEach(content -> assertTrue(content.startsWith("﻿")));
        assertTrue(files.get("biblioteca.csv").contains("demo-a,sim,não,não,8,\"'=HYPERLINK(\"\"x\"\")\""));
        assertFalse(files.get("biblioteca.csv").contains("da Bia"));
        assertTrue(files.get("diario.csv").contains("v1,demo-a,2025-01-02,não"));
        assertTrue(files.get("colecoes.csv").contains("c1,\"Ação, \"\"top\"\"\",,0,demo-a"));
        assertEquals("﻿obra,temporada,episodio,nota\r\n",files.get("episodios.csv"));
    }

    @Test void suspendedActorCannotExport() {
        db.update("update profile set active=false where actor=?",ANA);
        fails(403,() -> { try { service.export(ANA); } catch(IOException e) { throw new UncheckedIOException(e); } });
        fails(401,() -> { try { service.export("x"); } catch(IOException e) { throw new UncheckedIOException(e); } });
    }
}
