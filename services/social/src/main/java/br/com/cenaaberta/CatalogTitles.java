package br.com.cenaaberta;

import java.util.*;

import com.fasterxml.jackson.databind.JsonNode;

/** Metadados de várias obras de uma vez (title-batch do catálogo); separado para permitir lambda nos testes. */
interface CatalogTitles {
    /**
     * Busca os metadados das obras no catálogo.
     * @param ids identificadores já validados por Guards.validateTitle
     * @param details true para incluir {@code details} (gêneros e duração em minutos)
     * @return mapa id → JSON da obra (id, format, anime, name, year, poster...); obras não encontradas ficam de fora
     */
    Map<String,JsonNode> titles(Collection<String> ids,boolean details);
}
