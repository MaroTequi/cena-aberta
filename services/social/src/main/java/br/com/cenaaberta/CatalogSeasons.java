package br.com.cenaaberta;

import com.fasterxml.jackson.databind.JsonNode;

/** Consulta de temporadas no catálogo; separada para permitir troca por lambda nos testes. */
interface CatalogSeasons {
    /**
     * Busca os episódios de uma temporada.
     * @param titleId identificador da obra
     * @param season número da temporada
     * @return lista JSON de episódios (cada item tem o campo {@code number})
     */
    JsonNode season(String titleId,int season);

    JsonNode seasons(String titleId);
}
