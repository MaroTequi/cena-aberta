import Link from "next/link";
export default function Credits() {
  return (
    <main className="wrap">
      <section className="panel">
        <h1>Créditos dos avatares</h1>
        <p>
          Ícones por Lorc e Delapouite, disponíveis no <a href="https://game-icons.net/">Game-icons.net</a>, sob a
          licença <a href="https://creativecommons.org/licenses/by/3.0/">Creative Commons Attribution 3.0</a>.
        </p>
        <p>No Cena Aberta, adaptamos as cores, a escala e o fundo circular.</p>
        <ul>
          <li key="cinema">
            <a href="https://game-icons.net/1x1/delapouite/clapperboard.html">Direção</a> — Delapouite
          </li>
          <li key="estrelas">
            <a href="https://game-icons.net/1x1/delapouite/popcorn.html">Sessão pipoca</a> — Delapouite
          </li>
          <li key="fantasia">
            <a href="https://game-icons.net/1x1/lorc/dragon-head.html">Dragão</a> — Lorc
          </li>
          <li key="espaco">
            <a href="https://game-icons.net/1x1/delapouite/astronaut-helmet.html">Astronauta</a> — Delapouite
          </li>
          <li key="misterio">
            <a href="https://game-icons.net/1x1/delapouite/sherlock-holmes.html">Detetive</a> — Delapouite
          </li>
          <li key="animacao">
            <a href="https://game-icons.net/1x1/lorc/fox-head.html">Raposa</a> — Lorc
          </li>
          <li key="ninja">
            <a href="https://game-icons.net/1x1/lorc/ninja-mask.html">Ninja</a> — Lorc
          </li>
          <li key="samurai">
            <a href="https://game-icons.net/1x1/delapouite/samurai-helmet.html">Samurai</a> — Delapouite
          </li>
          <li key="robo">
            <a href="https://game-icons.net/1x1/delapouite/robot-helmet.html">Mecha</a> — Delapouite
          </li>
          <li key="mago">
            <a href="https://game-icons.net/1x1/delapouite/wizard-face.html">Mago</a> — Delapouite
          </li>
          <li key="series">
            <a href="https://game-icons.net/1x1/delapouite/tv.html">Retrô TV</a> — Delapouite
          </li>
          <li key="retro">
            <a href="https://game-icons.net/1x1/lorc/vintage-robot.html">Robô retrô</a> — Lorc
          </li>
        </ul>
        <h2>Onde assistir</h2>
        <p>
          A disponibilidade das obras em serviços de streaming no Brasil é fornecida pela{" "}
          <a href="https://www.justwatch.com/br">JustWatch</a>, por meio do TMDB.
        </p>
        <h2>Trailers</h2>
        <p>
          Os trailers são vídeos publicados no <a href="https://www.youtube.com/">YouTube</a> e exibidos pelo player
          oficial, sem cookies até você dar o play. A lista de vídeos de cada obra vem do TMDB.
        </p>
        <Link href="/">Cena Aberta</Link>
      </section>
    </main>
  );
}
