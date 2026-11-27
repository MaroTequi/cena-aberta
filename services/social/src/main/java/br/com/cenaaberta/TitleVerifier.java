package br.com.cenaaberta;

/** Confirma que uma obra existe no catálogo. */
public interface TitleVerifier {

    /**
     * Verifica a obra no catálogo.
     * @param titleId identificador da obra (já validado por Guards.validateTitle)
     * @return formato da obra informado pelo catálogo (ex.: "movie", "tv")
     */
    String verify(String titleId);
}
