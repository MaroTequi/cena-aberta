export function EditorialLinks({onNewsPage=false}:{onNewsPage?:boolean}) {
  return <>
    <a className="room-nav-link" href="/?aba=all#watch-guides-title">Recomendações</a>
    <a className="room-nav-link" href="/noticias" aria-current={onNewsPage?"page":undefined}>Notícias</a>
  </>;
}
