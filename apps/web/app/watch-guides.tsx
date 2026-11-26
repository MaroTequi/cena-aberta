const guides = [
  {category: "Filmes", source: "Omelete", title: "Filmes para ver no Globoplay", href: "https://www.omelete.com.br/filmes/globoplay-melhores-filmes-para-ver-agora"},
  {category: "Filmes", source: "AdoroCinema", title: "Três filmes da Netflix para o fim de semana", href: "https://www.adorocinema.com/noticias/filmes/noticia-1000209136/"},
  {category: "Séries", source: "Omelete", title: "Séries curtas para terminar no fim de semana", href: "https://www.omelete.com.br/series-tv/series-curtas-fim-de-semana"},
  {category: "Séries", source: "AdoroCinema", title: "Três séries da Netflix e do Prime Video para maratonar", href: "https://www.adorocinema.com/noticias/series/noticia-1000232602/"},
  {category: "Animes", source: "Omelete", title: "Dez animes para assistir na Crunchyroll", href: "https://www.omelete.com.br/mangas-animes/melhores-animes-crunchyroll"},
  {category: "Animes", source: "Omelete", title: "Seis animes para quem gostou de Solo Leveling", href: "https://www.omelete.com.br/mangas-animes/animes-para-quem-curtiu-solo-leveling"},
];

export function WatchGuides() {
  return <section className="panel" aria-labelledby="watch-guides-title">
    <h2 id="watch-guides-title">O que assistir</h2>
    <div className="watch-guides">
      {["Filmes", "Séries", "Animes"].map(category => <div key={category}>
        <h3>{category}</h3>
        <ul>{guides.filter(guide => guide.category === category).map(guide =>
          <li key={guide.href}><a href={guide.href}>{guide.title}</a><small>{guide.source}</small></li>
        )}</ul>
      </div>)}
    </div>
  </section>;
}
