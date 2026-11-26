export function EditorialLinks({onNewsPage=false,onRecommendationsPage=false}:{onNewsPage?:boolean;onRecommendationsPage?:boolean}) {
  return <>
    <a className="room-nav-link" href="/recomendacoes" aria-current={onRecommendationsPage?"page":undefined}>Recomendações</a>
    <a className="room-nav-link" href="/noticias" aria-current={onNewsPage?"page":undefined}>Notícias</a>
  </>;
}
