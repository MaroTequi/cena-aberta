import { topics, newsFeed, dateFormat } from "./feed";
import { NewsList } from "./news-list";
export async function LandingNews() {
  const { items, failed } = await newsFeed();
  return (
    <section className="panel landing-news" aria-labelledby="landing-news-title">
      <h2 id="landing-news-title">
        <a href="/noticias">Notícias</a>
      </h2>
      <NewsList
        topics={topics.map((s) => s.topic)}
        failed={failed.map((s) => ({ topic: s.topic, name: s.name }))}
        items={items.map(({ source, title, link, image, date }) => ({
          topic: source.topic,
          source: source.name,
          title,
          link,
          image,
          date: dateFormat.format(date),
          iso: date.toISOString(),
        }))}
      />
    </section>
  );
}
