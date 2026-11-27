package br.com.cenaaberta;

import java.util.*;

/** Obras fictícias do modo demo (sem TMDB_TOKEN) e os detalhes de cada uma. */
final class DemoTitles {

    private DemoTitles() {}

    static final List<Catalog.Title> FIXTURES = List.of(

        new Catalog.Title("demo-ultimo-rolo","movie",false,"O Último Rolo","O Último Rolo","2024","Uma projecionista procura o último filme de uma sala prestes a fechar.",null),

        new Catalog.Title("demo-mare-alta","tv",false,"Maré Alta","Maré Alta","2025","O retorno de uma fotógrafa põe em movimento os segredos de uma cidade litorânea.",null),

        new Catalog.Title("demo-lua-de-papel","movie",true,"Lua de Papel","Kami no Tsuki","2023","Uma aprendiz de cartógrafa desenha um caminho para casa num céu em constante mudança.",null),

        new Catalog.Title("demo-neon-norte","tv",true,"Neon Norte","Neon North","2025","Mensageiros cruzam de bicicleta uma cidade que só desperta depois da meia-noite.",null),

        new Catalog.Title("demo-fim-da-linha","movie",false,"Fim da Linha","Fim da Linha","2022","Duas pessoas dividem o último ônibus e um plano para recomeçar.",null),

        new Catalog.Title("demo-arquipelago","tv",false,"Arquipélago","Arquipélago","2024","Uma equipe de rádio documenta a vida em ilhas separadas pela névoa.",null)

    );

    static Catalog.Details demoDetails(String id) {

        return switch (id) {

            case "demo-ultimo-rolo" -> new Catalog.Details(List.of("Drama"),96,null,null,List.of(),List.of(),List.of());

            case "demo-mare-alta" -> new Catalog.Details(List.of("Drama","Mistério"),null,2,3,List.of(),List.of(),List.of());

            case "demo-lua-de-papel" -> new Catalog.Details(List.of("Animação","Fantasia"),104,null,null,List.of(),List.of(),List.of());

            case "demo-neon-norte" -> new Catalog.Details(List.of("Animação","Aventura"),null,1,12,List.of(),List.of(),List.of());

            case "demo-fim-da-linha" -> new Catalog.Details(List.of("Drama"),88,null,null,List.of(),List.of(),List.of());

            default -> new Catalog.Details(List.of("Drama"),null,1,6,List.of(),List.of(),List.of());

        };

    }
}
