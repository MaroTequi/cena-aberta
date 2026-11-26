import {EditorialImage} from "./editorial-image";

const guides = [
  {category: "Filmes", source: "Omelete", title: "Filmes para ver no Globoplay", image: "https://cdn.ome.lt/yUgwvetHW0np3z9EQ2wz5b44HlU=/1200x630/smart/filters:format(webp)/extras/conteudos/melhores-filmes-globoplay-2025.png", href: "https://www.omelete.com.br/filmes/globoplay-melhores-filmes-para-ver-agora"},
  {category: "Filmes", source: "AdoroCinema", title: "Três filmes da Netflix para o fim de semana", href: "https://www.adorocinema.com/noticias/filmes/noticia-1000209136/"},
  {category: "Séries", source: "Omelete", title: "Séries curtas para terminar no fim de semana", image: "https://cdn.ome.lt/ynKLLQAPJuQ8CnH7d6z1vLmF5Iw=/1200x630/smart/filters:format(webp)/extras/conteudos/series-fim-de-semana.jpg", href: "https://www.omelete.com.br/series-tv/series-curtas-fim-de-semana"},
  {category: "Séries", source: "AdoroCinema", title: "Três séries da Netflix e do Prime Video para maratonar", href: "https://www.adorocinema.com/noticias/series/noticia-1000232602/"},
  {category: "Animes", source: "Omelete", title: "Dez animes para assistir na Crunchyroll", image: "https://cdn.ome.lt/o1Jml_ACXAxI52f5Q2zSPTviyRg=/1200x630/smart/filters:format(webp)/extras/conteudos/animes_crunchyroll.png", href: "https://www.omelete.com.br/mangas-animes/melhores-animes-crunchyroll"},
  {category: "Animes", source: "Omelete", title: "Seis animes para quem gostou de Solo Leveling", image: "https://cdn.ome.lt/8OlmaNv_91jcHo1khZwHmIc0pYI=/1200x630/smart/filters:format(webp)/extras/conteudos/Captura_de_tela_2025-04-17_093547.png", href: "https://www.omelete.com.br/mangas-animes/animes-para-quem-curtiu-solo-leveling"},
];

export function WatchGuides({standalone=false}:{standalone?:boolean}) {
  const CategoryHeading=standalone?"h2":"h3";
  return <section className="panel" aria-labelledby="watch-guides-title">
    {standalone?<h1 id="watch-guides-title">Recomendações</h1>:<h2 id="watch-guides-title"><a href="/recomendacoes">Recomendações</a></h2>}
    <div className="watch-guides">
      {["Filmes", "Séries", "Animes"].map(category => <div key={category}>
        <CategoryHeading>{category}</CategoryHeading>
        <ul>{guides.filter(guide => guide.category === category).map(guide =>
          <li key={guide.href}><a className="editorial-row" href={guide.href}><EditorialImage topic={guide.category} src={guide.image}/><span>{guide.title}<small>{guide.source}</small></span></a></li>
        )}</ul>
      </div>)}
    </div>
  </section>;
}
