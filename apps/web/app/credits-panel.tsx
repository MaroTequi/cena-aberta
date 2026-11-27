/** Painel "Sobre o alpha": créditos do TMDB e resumo de privacidade. */
export function CreditsPanel() {
  return (
    <section className="panel">
      <h2>Sobre o alpha</h2>
      <p>Cena Aberta é um diário audiovisual em desenvolvimento. O catálogo de demonstração usa obras fictícias.</p>
      <p>
        <a href="https://www.themoviedb.org/">
          <img
            src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
            width={88}
            alt="The Movie Database"
          />
        </a>
      </p>
      <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      <p>
        A visibilidade das seções é definida por você no perfil. Novas notas e resenhas são públicas por padrão. Você
        pode tornar cada avaliação privada pelo controle de visibilidade. Somente as seções habilitadas ficam visíveis
        para quem visita seu perfil.
      </p>
    </section>
  );
}
