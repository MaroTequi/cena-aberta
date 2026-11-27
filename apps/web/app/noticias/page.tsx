import { getServerSession } from "next-auth";
import { authOptions, emailAccounts } from "../../lib/auth";
import { UserPageHeader } from "../user-pages";
import { EditorialImage } from "../editorial-image";
import type { Metadata } from "next";
import "./news.css";
import { topics, dateFormat, newsFeed } from "./feed";

export const metadata: Metadata = {
  title: "Notícias · Cena Aberta",
  description: "Manchetes de filmes, séries e animes da imprensa brasileira.",
};
export default async function News({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  const { tema } = await searchParams;
  const selected = topics.find((s) => s.slug === tema);
  const [{ items, failed }, session] = await Promise.all([
    newsFeed(selected?.slug),
    getServerSession(authOptions) as Promise<{ actor?: string } | null>,
  ]);
  return (
    <>
      <UserPageHeader authenticated={Boolean(session?.actor)} emailAccounts={emailAccounts} tab="news" />
      <main className="wrap news-page">
        <h1>Notícias</h1>
        <nav className="news-topics" aria-label="Filtrar notícias por tema">
          <a href="/noticias" aria-current={!selected ? "page" : undefined}>
            Todas
          </a>
          {topics.map((s) => (
            <a key={s.slug} href={"/noticias?tema=" + s.slug} aria-current={selected === s ? "page" : undefined}>
              {s.topic}
            </a>
          ))}
        </nav>
        {failed.length > 0 && (
          <p role="status">
            Não foi possível carregar {failed.map((s) => s.topic.toLowerCase() + " (" + s.name + ")").join(", ")} agora.
          </p>
        )}
        {!items.length && !failed.length && <p>Nenhuma notícia disponível.</p>}
        {items.map((item) => (
          <article className="editorial-row news-story" key={item.link}>
            <EditorialImage src={item.image} topic={item.source.topic} />
            <div>
              <div className="news-byline">
                <strong>{item.source.topic}</strong>
                <span>{item.source.name}</span>
                <time dateTime={item.date.toISOString()}>{dateFormat.format(item.date)}</time>
              </div>
              <h2>
                <a href={item.link}>{item.title}</a>
              </h2>
            </div>
          </article>
        ))}
      </main>
    </>
  );
}
