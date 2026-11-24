package br.com.cenaaberta;

import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.zip.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.apache.commons.csv.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

@RestController
@RequestMapping("/imports/letterboxd")
public class LetterboxdImport {
    record Row(String kind,String name,String year,Integer rating,String review,String date,boolean rewatch,String list,int occurrence,String title) {}
    record Batch(List<Row> rows,Set<Integer> keepPublic) {
        Batch(List<Row> rows){this(rows,Set.of());}
    }
    private final JdbcTemplate db;private final ObjectMapper mapper;private final String secret,catalog,catalogKey;
    LetterboxdImport(JdbcTemplate db,ObjectMapper mapper,@Value("${internal.secret}") String secret,@Value("${CATALOG_URL:http://127.0.0.1:8181}") String catalog,@Value("${CATALOG_INTERNAL_SECRET}") String catalogKey){this.db=db;this.mapper=mapper;this.secret=secret;this.catalog=catalog;this.catalogKey=catalogKey;}
    static void bad(String message){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    @ModelAttribute void verify(HttpServletRequest request){
        String key=request.getHeader("X-Internal-Key"),actor=request.getHeader("X-Actor");
        if(key==null||!MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),key.getBytes(StandardCharsets.UTF_8)))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if(actor==null||db.queryForObject("select count(*) from profile where actor=? and active=true",Integer.class,actor)!=1)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Conclua seu perfil.");
    }
    @PostMapping("/preview") Map<String,Object> preview(@RequestParam("file") MultipartFile file) throws IOException {
        if(file.getSize()>10_000_000)bad("O ZIP deve ter até 10 MB.");
        return parse(file.getInputStream());
    }
    static Map<String,Object> parse(InputStream input) throws IOException {
        var rows=new ArrayList<Row>();var warnings=new ArrayList<String>();int files=0,total=0;
        try(var zip=new ZipInputStream(input,StandardCharsets.UTF_8)){
            ZipEntry entry;
            while((entry=zip.getNextEntry())!=null){
                if(++files>300)bad("O ZIP tem mais de 300 arquivos.");
                var data=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
                while((n=zip.read(buffer))!=-1){total+=n;if(total>20_000_000)bad("O conteúdo descompactado excede 20 MB.");data.write(buffer,0,n);}
                String path=entry.getName().replace('\\','/').toLowerCase(Locale.ROOT);
                if(path.contains("..")||path.startsWith("/")||path.startsWith("deleted/")||!path.endsWith(".csv"))continue;
                String kind=path.substring(0,path.length()-4);
                if(!Set.of("watched","watchlist","ratings","reviews","diary").contains(kind))continue;
                try(var parser=CSVFormat.DEFAULT.builder().setIgnoreEmptyLines(true).build().parse(new StringReader(data.toString(StandardCharsets.UTF_8).replace("\uFEFF","")))){
                    Map<String,Integer> header=null;var occurrences=new HashMap<String,Integer>();
                    for(var record:parser){
                        if(header==null){
                            var candidate=new HashMap<String,Integer>();for(int i=0;i<record.size();i++)candidate.put(record.get(i).strip(),i);
                            if((candidate.containsKey("Name")||candidate.containsKey("Title"))&&candidate.containsKey("Year"))header=candidate;
                            continue;
                        }
                        String name=cell(record,header,header.containsKey("Name")?"Name":"Title"),year=cell(record,header,"Year");
                        if(name.isBlank())continue;
                        Integer rating=null;String raw=cell(record,header,"Rating");
                        if(!raw.isBlank()){double value=Double.parseDouble(raw);if(value<.5||value>5||value*2!=Math.rint(value*2))throw new IllegalArgumentException();rating=(int)(value*2);}
                        String date=cell(record,header,"Watched Date");if(date.isBlank())date=cell(record,header,"WatchedDate");
                        if(!date.isBlank())LocalDate.parse(date);
                        String review=plain(cell(record,header,"Review"));
                        if(review.length()>3000){warnings.add("Resenha de "+name+" limitada a 3000 caracteres.");review=review.substring(0,3000);}
                        String key=name+"|"+year+"|"+date;int occurrence=occurrences.merge(key,1,Integer::sum);
                        String rewatch=cell(record,header,"Rewatch");
                        rows.add(new Row(kind,name,year,rating,review,date,rewatch.equalsIgnoreCase("yes")||rewatch.equalsIgnoreCase("true"),"",occurrence,null));
                        if(rows.size()>2000)bad("Limite de 2000 registros por importação. Envie CSVs em um ZIP menor.");
                    }
                    if(header==null)warnings.add("Arquivo sem cabeçalho reconhecido: "+entry.getName());
                }catch(IllegalArgumentException failure){bad("Dados inválidos em "+entry.getName()+". Confira notas e datas do CSV.");}
            }
        }catch(ZipException error){bad("ZIP inválido ou corrompido.");}
        if(rows.isEmpty())bad("Nenhum filme encontrado. Envie o ZIP exportado pelo Letterboxd.");
        rows.sort(Comparator.comparingInt(r -> List.of("ratings","reviews","watched","watchlist","diary").indexOf(r.kind())));
        return Map.of("rows",rows,"warnings",warnings,"note","Conteúdo excluído, curtidas, seguidores, tags e comentários não são importados. Resenhas são convertidas para texto e mantidas privadas.");
    }
    static String cell(CSVRecord row,Map<String,Integer> header,String key){Integer i=header.get(key);return i==null||i>=row.size()?"":row.get(i).strip();}
    static String plain(String html){return HtmlUtils.htmlUnescape(html.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>","").replaceAll("(?i)<br\\s*/?>","\n").replaceAll("<[^>]*>","")).strip();}
    @PostMapping("/commit") @Transactional
    Map<String,Object> commit(@RequestHeader("X-Actor") String actor,@RequestBody Batch batch) throws Exception {
        if(batch.rows()==null||batch.rows().isEmpty()||batch.rows().size()>30)bad("Envie de 1 a 30 registros por lote.");
        for(Row row:batch.rows()){
            if(row.title()==null||!row.title().matches("(?:tmdb-movie-[1-9][0-9]{0,12}|demo-[a-z0-9-]+)")||!Set.of("watched","watchlist","ratings","reviews","diary").contains(row.kind())||row.name()==null||row.name().length()>500||row.review()==null||row.review().length()>3000||row.occurrence()<1||row.occurrence()>2000)bad("Registro inválido.");
            if(row.rating()!=null&&(row.rating()<1||row.rating()>10))bad("Nota inválida.");
            if(row.date()==null)bad("Data inválida.");
            if(!row.date().isBlank())try{LocalDate.parse(row.date());}catch(Exception e){bad("Data inválida.");}
        }
        var ids=batch.rows().stream().map(Row::title).distinct().toList();
        try(var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()){
            var response=client.send(HttpRequest.newBuilder(URI.create(catalog+"/title-batch?ids="+String.join(",",ids))).header("X-Internal-Key",catalogKey).timeout(Duration.ofSeconds(25)).GET().build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catálogo indisponível; tente este lote novamente.");
            var valid=new HashSet<String>();for(var film:mapper.readTree(response.body()))if(film.path("format").asText().equals("movie"))valid.add(film.path("id").asText());
            if(!valid.containsAll(ids))bad("Um dos filmes não foi encontrado no catálogo.");
        }
        if(db.queryForList("select actor from profile where actor=? and active=true for update",actor).isEmpty())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        int imported=0,skipped=0;
        var pending=new ArrayList<Integer>();
        var added=new ArrayList<Integer>();
        var deferred=new ArrayList<Integer>();
        for(int index=0;index<batch.rows().size();index++){
            Row row=batch.rows().get(index);
            if(row.kind().equals("diary")&&row.date().isBlank()){pending.add(index);continue;}
            String key=row.kind()+"|"+row.title()+"|"+(row.kind().equals("diary")?row.date()+"|"+row.occurrence():"");
            String fingerprint=fingerprint(key);
            if(db.queryForObject("select count(*) from letterboxd_receipt where actor=? and fingerprint=?",Integer.class,actor,fingerprint)>0){skipped++;continue;}
            if(row.kind().equals("diary")&&row.occurrence()>1){
                String previous="diary|"+row.title()+"|"+row.date()+"|"+(row.occurrence()-1);
                if(db.queryForObject("select count(*) from letterboxd_receipt where actor=? and fingerprint=?",Integer.class,actor,fingerprint(previous))==0){
                    deferred.add(index);continue;
                }
            }
            boolean watched=Set.of("watched","ratings","reviews","diary").contains(row.kind());
            var existing=db.queryForList("select * from library where actor=? and title=?",actor,row.title());
            var saved=existing.isEmpty()?Map.<String,Object>of():existing.getFirst();
            boolean hasReview=!Objects.toString(saved.get("review"),"").isBlank();
            boolean addReview=!hasReview&&!row.review().isBlank();
            boolean addRating=saved.get("rating")==null&&row.rating()!=null;
            boolean publicEvaluation=Boolean.TRUE.equals(saved.get("evaluation_public"))&&(hasReview||saved.get("rating")!=null);
            if(publicEvaluation&&(addReview||addRating)&&(batch.keepPublic()==null||!batch.keepPublic().contains(index))){
                pending.add(index);continue;
            }
            int changes=0;
            if(existing.isEmpty())db.update("insert into library(actor,title) values(?,?)",actor,row.title());
            if(watched)changes+=db.update("update library set watched=true,version=version+1 where actor=? and title=? and watched=false and interest=false",actor,row.title());
            if(row.kind().equals("watchlist"))changes+=db.update("update library set interest=true,version=version+1 where actor=? and title=? and watched=false and interest=false",actor,row.title());
            if(addRating)changes+=db.update("update library set rating=?,evaluation_public=?,version=version+1 where actor=? and title=?",row.rating(),publicEvaluation,actor,row.title());
            if(addReview)changes+=db.update("update library set review_published_at=CURRENT_TIMESTAMP,review=?,spoiler=true,evaluation_public=?,version=version+1 where actor=? and title=?",row.review(),publicEvaluation,actor,row.title());
            if(row.kind().equals("diary")&&!row.date().isBlank()){
                var date=LocalDate.parse(row.date());
                if(db.queryForObject("select count(*) from viewing where actor=? and title=? and watched_on=?",Integer.class,actor,row.title(),date)<row.occurrence())
                    changes+=db.update("insert into viewing(id,actor,title,watched_on,rewatch) values(?,?,?,?,?)",UUID.randomUUID().toString(),actor,row.title(),date,row.rewatch());
            }
            db.update("insert into letterboxd_receipt(actor,fingerprint) values(?,?)",actor,fingerprint);
            if(changes>0){imported++;added.add(index);}else skipped++;
        }
        return Map.of("imported",imported,"skipped",skipped,"pending",pending,"added",added,"deferred",deferred);
    }
    private String fingerprint(String key) throws NoSuchAlgorithmException {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
    }
}
