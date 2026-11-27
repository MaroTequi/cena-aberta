"use client";
import { WatchGuides } from "./watch-guides";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SeriesSeasons } from "./series-seasons";
import Link from "next/link";
import { EpisodeRatings } from "./episode-ratings";
import { WorkPeople } from "./work-people";
import { rankingGroup, rankingGroups, seasonHref, seasonName, workHref, workKind } from "../lib/work-links";
import { CommunityScore, FilmFacts, Poster, Spoiler } from "./title-parts";
import type { Title } from "../lib/types";
import { CardTitle } from "./card-title";
import { ThemePicker } from "./theme-picker";
import { CatalogSearch } from "./catalog-search";
import { FilmRanking, rankingCategories } from "./film-ranking";
import type { Release } from "../lib/releases";
import { Landing } from "./landing";
import { UiIcon } from "./ui-icons";
import { StarRating } from "./star-rating";
import { ProfileFriends } from "./profile-friends";
import { ProfileFriend } from "./profile-friend";
import { ReviewEditor } from "./review-editor";
import { Icon, IconAction } from "./action-icons";
import { ProfileAvatar, ProfileForm, type ProfileInput } from "./profile-form";
import { LibraryPage } from "./library-page";
import { ProfileLists } from "./profile-lists";
import { ProfileCompatibility } from "./profile-compatibility";
import { AddToCollection } from "./title-social/add-to-collection";
import { RecommendTitle } from "./title-social/recommend-title";
import { TitleFriends } from "./title-social/title-friends";
import { ReviewSocial } from "./title-social/review-social";
import { MainHeader, categories } from "./main-header";

import { api } from "../lib/client-api";
import type {
  Community,
  Dashboard,
  Entry,
  PendingViewing,
  RankedSeries,
  SeasonProgress,
  Section,
  Viewing,
} from "../lib/dashboard-types";
import { profileSections } from "../lib/dashboard-types";
import { demoEpisodeRatings, demoEvaluations, demoSum, demoTitleNames } from "../lib/demo-community";
import { displayRating, sessionDate, sessionTime } from "../lib/display-format";
import { DiaryDialog } from "./diary-dialog";
import { ReviewReader } from "./review-reader";
import { CreditsPanel } from "./credits-panel";

const empty: Entry = {
  title: "",
  watched: false,
  interest: false,
  rewatching: false,
  rating: null,
  review: null,
  spoiler: false,
  version: 0,
};
export function App({
  chronology,
  monthlyReviews,
  exploreNews,
  releases = [],
  authenticated,
  inviteLogin,
  emailAccounts,
  pageTitle,
  initialTab = "all",
  profileUser,
  showCommunityDemo = false,
  seriesPart,
}: {
  seriesPart?: { seriesId: string; season: number; episode?: number };
  chronology?: ReactNode;
  monthlyReviews?: ReactNode;
  exploreNews?: ReactNode;
  releases?: Release[];
  authenticated: boolean;
  inviteLogin: boolean;
  emailAccounts: boolean;
  pageTitle?: string;
  initialTab?: string;
  profileUser?: string;
  showCommunityDemo?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [titles, setTitles] = useState<Title[]>([]),
    [known, setKnown] = useState<Record<string, Title>>({}),
    [more, setMore] = useState(false),
    [demo, setDemo] = useState(false);
  const [diaryTitle, setDiaryTitle] = useState<{ id: string; name: string } | null>(null);
  const [data, setData] = useState<Dashboard | null>(null),
    [other, setOther] = useState<Dashboard | null>(null);
  const [title, setTitle] = useState<Title | null>(null),
    [community, setCommunity] = useState<Community | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [rankedSeries, setRankedSeries] = useState<RankedSeries[]>([]);
  const [rankItems, setRankItems] = useState<{ title: string; tier: number }[] | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [pendingViewing, setPendingViewing] = useState<PendingViewing | null>(null);
  const [credits, setCredits] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [titleRetry, setTitleRetry] = useState(0);
  const detail = useRef<HTMLElement>(null);
  const sessionDialog = useRef<HTMLDialogElement>(null);
  const viewingDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = viewingDialog.current;
    if (viewing && !dialog?.open) dialog?.showModal();
    if (!viewing && dialog?.open) dialog.close();
  }, [viewing]);
  const pendingKeys = useRef(new Map<string, string>());
  const openSequence = useRef(0);
  useEffect(() => {
    if (title) detail.current?.focus();
  }, [title]);
  useEffect(() => {
    const dialog = sessionDialog.current;
    if (pendingViewing && !dialog?.open) dialog?.showModal();
    if (!pendingViewing && dialog?.open) dialog.close();
  }, [pendingViewing]);
  const label = (id: string) => known[id]?.name ?? demoTitleNames[id] ?? "Obra do catálogo";
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Falha inesperada.");
  const rankingTab = tab === "ranking";
  const refresh = useCallback(async () => {
    const value = await api<Dashboard>(
      pageTitle ? "me?title=" + encodeURIComponent(pageTitle) : rankingTab ? "me" : "me?summary=true",
    );
    setData(value);
    return value;
  }, [pageTitle, rankingTab]);
  useEffect(() => {
    if (authenticated) refresh().catch(fail);
  }, [authenticated, refresh]);
  useEffect(() => {
    if (
      !authenticated ||
      tab === "profile" ||
      tab === "ranking" ||
      tab === "reviews" ||
      tab === "recommendations" ||
      pageTitle
    )
      return;
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({ type: tab, query: search, page: String(page) });
    api<{ items: Title[]; hasMore: boolean; demo: boolean }>("titles?" + params)
      .then((result) => {
        if (!current) return;
        setTitles(result.items);
        setKnown((previous) => ({ ...previous, ...Object.fromEntries(result.items.map((item) => [item.id, item])) }));
        setMore(result.hasMore);
        setDemo(result.demo);
      })
      .catch((e) => {
        if (current) {
          setTitles([]);
          setMore(false);
          fail(e);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [authenticated, tab, search, page, pageTitle]);
  useEffect(() => {
    if (tab !== "profile" && tab !== "ranking") return;
    const current = other ?? data;
    if (!current) return;
    const ids = [
      ...new Set([
        ...(current.library ?? []).map((i) => i.title),
        ...(current.ranking ?? []).map((i) => i.title),
        ...(current.viewings ?? []).map((i) => i.title),
      ]),
    ].filter((id) => !known[id]);
    if (!ids.length) return;
    let currentRequest = true;
    (async () => {
      const found: Title[] = [];
      for (let i = 0; i < ids.length && currentRequest; i += 30) {
        const group = await api<Title[]>("title-batch?ids=" + encodeURIComponent(ids.slice(i, i + 30).join(",")));
        found.push(...group);
      }
      if (currentRequest && found.length)
        setKnown((prev) => ({ ...prev, ...Object.fromEntries(found.map((item) => [item.id, item])) }));
    })().catch((e) => {
      if (currentRequest) fail(e);
    });
    return () => {
      currentRequest = false;
    };
    // Resolve saved titles when the profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, other, data, titleRetry]);
  async function action(work: () => Promise<unknown>, message: string) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await work();
      await refresh();
      setNotice(message);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function create(path: string, body: unknown) {
    const fingerprint = path + "\u0000" + JSON.stringify(body);
    const key = pendingKeys.current.get(fingerprint) ?? crypto.randomUUID();
    pendingKeys.current.set(fingerprint, key);
    const result = await api(path, "POST", body, key);
    pendingKeys.current.delete(fingerprint);
    return result;
  }
  function open(id: string) {
    router.push(workHref(id));
  }
  async function loadTitle(id: string) {
    const sequence = ++openSequence.current;
    setError("");
    setNotice("");
    setCommunity(null);
    try {
      const item = await api<Title>("titles/" + id);
      if (sequence !== openSequence.current) return;
      setKnown((old) => ({ ...old, [id]: item }));
      setTitle(item);
      if (data?.profile) {
        const result = await api<Community>("titles/" + id + "/community");
        if (sequence === openSequence.current) setCommunity(result);
      }
    } catch (e) {
      if (sequence === openSequence.current) fail(e);
    }
  }
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    if (pageTitle) void loadTitle(pageTitle);
  }, [pageTitle, data?.profile?.username]);
  useEffect(() => {
    if (profileUser && data?.profile)
      api<Dashboard>("profiles?summary=true&username=" + encodeURIComponent(profileUser))
        .then(setOther)
        .catch(fail);
  }, [profileUser, data?.profile?.username]);
  useEffect(() => {
    if (!data?.profile || !pageTitle) return;
    let current = true;
    api<{ items: { title: string; tier: number }[]; automatic: RankedSeries[] }>("me/ranking")
      .then((result) => {
        if (current) {
          setRankItems(result.items);
          setRankedSeries(result.automatic);
        }
      })
      .catch((error) => {
        if (current) fail(error);
      });
    return () => {
      current = false;
    };
  }, [data, pageTitle]);
  function rankControl(id: string) {
    if (!rankItems || !data?.library?.some((item) => item.title === id && item.watched)) return null;
    const tier = rankItems.find((item) => item.title === id)?.tier ?? -1;
    return (
      <fieldset className="card-ranking">
        <legend>Ranking</legend>
        <div className="rank-choices">
          {rankingCategories
            .map((name, index) => ({ name, index }))
            .reverse()
            .map(({ name, index }) => (
              <button
                key={name}
                type="button"
                className={"rank-choice rank-tier-" + index}
                aria-pressed={tier === index}
                disabled={busy}
                onClick={() => {
                  const next = tier === index ? -1 : index;
                  void action(
                    async () => {
                      const result = await api<{ items: { title: string; tier: number }[] }>(
                        "me/ranking/" + id,
                        "PUT",
                        { tier: next },
                      );
                      setRankItems(result.items);
                    },
                    next === -1 ? "Removido do ranking." : "Ranking salvo.",
                  );
                }}
              >
                {tier === index && <span aria-hidden="true">✓ </span>}
                {name}
              </button>
            ))}
        </div>
      </fieldset>
    );
  }
  function closeTitle() {
    openSequence.current++;
    setTitle(null);
    if (pageTitle) router.push("/");
  }
  function changeTab(next: string) {
    if (pageTitle || tab === "ranking" || tab === "reviews" || tab === "recommendations") {
      router.push(next === "all" ? "/" : "/?aba=" + next);
      return;
    }
    setTab(next);
    setPage(1);
    closeTitle();
    setError("");
    setNotice("");
    setOther(null);
  }
  function update(kind: string, body: unknown) {
    if (!title) return;
    return action(async () => {
      await api("me/library/" + title.id + "/" + kind, "PUT", body);
      if (["review", "rating", "visibility"].includes(kind) && data?.profile)
        setCommunity(await api<Community>("titles/" + title.id + "/community"));
    }, "Alteração salva.");
  }
  async function refreshCommunity(id: string) {
    const sequence = openSequence.current;
    try {
      const next = await api<Community>("titles/" + id + "/community");
      if (sequence === openSequence.current) setCommunity(next);
    } catch (e) {
      if (sequence === openSequence.current) fail(e);
    }
  }
  function visibilityControl(item: Entry) {
    const isPublic = !!item.evaluation_public;
    return (
      <IconAction
        kind="visibility"
        active={isPublic}
        disabled={busy}
        label={isPublic ? "Avaliação pública" : "Avaliação privada"}
        onClick={() =>
          void action(
            async () => {
              await api("me/library/" + item.title + "/visibility", "PUT", { value: !isPublic });
              if (title?.id === item.title) await refreshCommunity(item.title);
            },
            isPublic ? "Avaliação privada." : "Avaliação pública.",
          )
        }
      />
    );
  }
  function confirmViewing() {
    if (!pendingViewing || busy) return;
    const { title, watchedAt } = pendingViewing;
    void action(async () => {
      await create("me/viewings", { title, watchedAt, rewatch: true });
      setPendingViewing(null);
    }, "Sessão salva.");
  }
  const seasonProgressPath =
    seriesPart && seriesPart.episode === undefined
      ? "me/season-progress/" + seriesPart.seriesId + "/" + seriesPart.season
      : null;
  const [seasonProgress, setSeasonProgress] = useState<SeasonProgress | null>(null);
  const [progressError, setProgressError] = useState("");
  const [progressRetry, setProgressRetry] = useState(0);
  useEffect(() => {
    if (!seasonProgressPath || !data?.profile) return;
    let current = true;
    setProgressError("");
    api<SeasonProgress>(seasonProgressPath)
      .then((result) => {
        if (current) setSeasonProgress(result);
      })
      .catch((error) => {
        if (current) setProgressError((error as Error).message);
      });
    return () => {
      current = false;
    };
  }, [seasonProgressPath, data, progressRetry]);
  const [seriesComplete, setSeriesComplete] = useState<boolean | "unavailable" | null>(null);
  const seriesId = title?.format === "tv" ? title.id : null;
  useEffect(() => {
    setSeriesComplete(null);
    if (!seriesId || !data?.profile) return;
    let active = true;
    api<{ complete: boolean }>("me/series-progress/" + seriesId)
      .then((result) => {
        if (active) setSeriesComplete(result.complete);
      })
      .catch(() => {
        if (active) setSeriesComplete("unavailable");
      });
    return () => {
      active = false;
    };
  }, [seriesId, data]);
  const seasonComplete = seasonProgress?.complete && !progressError;
  const seriesScore = rankedSeries.find((item) => item.title === title?.id);
  const entry = data?.library?.find((item) => item.title === title?.id) ?? empty;
  const anyEpisodeWatched = seasonProgress ? seasonProgress.watched > 0 : entry.watched;
  const current = other ?? data;
  const owned = !other || other.profile?.username === data?.profile?.username;
  function sectionVisibility(section: Section | "all", label: string) {
    if (!owned) return null;
    const visible =
      section === "all" ? profileSections.every((key) => current?.visibility?.[key]) : !!current?.visibility?.[section];
    const mixed = section === "all" && !visible && profileSections.some((key) => current?.visibility?.[key]);
    const hint =
      section === "all"
        ? mixed
          ? "Algumas seções visíveis para visitantes"
          : visible
            ? "Todas as seções visíveis para visitantes"
            : "Todas as seções ocultas para visitantes"
        : label.charAt(0).toUpperCase() +
          label.slice(1) +
          ": " +
          (section === "watched"
            ? visible
              ? "visíveis para visitantes"
              : "ocultos para visitantes"
            : visible
              ? "visível para visitantes"
              : "oculto para visitantes");
    return (
      <button
        type="button"
        className="visibility-toggle"
        disabled={busy}
        aria-label={hint}
        title={hint}
        aria-pressed={mixed ? "mixed" : visible}
        onClick={() =>
          void action(
            () => api("me/visibility", "PUT", { section, visible: !visible }),
            section === "diary" ? "" : visible ? "Seção oculta para visitantes." : "Seção visível para visitantes.",
          )
        }
      >
        <UiIcon name={visible ? "eye" : "hidden"} />
      </button>
    );
  }
  function showSection(section: Section) {
    return owned || !!current?.visibility?.[section];
  }
  function saveProfile(input: ProfileInput) {
    void action(() => api("me/profile", "PUT", input), "Perfil salvo.");
  }
  function savedCard(id: string) {
    const work = known[id];
    return (
      <button className="card" onClick={() => open(id)}>
        {work ? (
          <Poster title={work} />
        ) : (
          <div className="poster">
            <span>{label(id)}</span>
          </div>
        )}
        <CardTitle>{label(id)}</CardTitle>
        {work && (
          <small>
            {work.year} · {workKind(work)}
          </small>
        )}
      </button>
    );
  }
  async function visit(username: string) {
    if (pageTitle) {
      router.push("/?usuario=" + encodeURIComponent(username));
      return;
    }
    try {
      const person = await api<Dashboard>("profiles?summary=true&username=" + encodeURIComponent(username));
      changeTab("profile");
      setOther(person);
    } catch (e) {
      fail(e);
    }
  }
  return (
    <>
      <MainHeader
        authenticated={authenticated}
        emailAccounts={emailAccounts}
        tab={tab}
        profile={data?.profile}
        profileActive={tab === "profile" && !pageTitle && owned}
        onCategory={changeTab}
        onProfile={() => changeTab("profile")}
      />
      <main className="wrap">
        {error && (
          <p role="alert" className="message error">
            {error}
            {(tab === "profile" || tab === "ranking") && (
              <button
                className="small"
                onClick={() => {
                  setError("");
                  setTitleRetry((n) => n + 1);
                }}
              >
                Tentar carregar os cards novamente
              </button>
            )}
          </p>
        )}
        {notice && (
          <p role="status" className="message">
            {notice}
          </p>
        )}
        {pageTitle && !title && !error && <p role="status">Carregando detalhes da obra…</p>}
        {tab === "recommendations" ? (
          <WatchGuides standalone />
        ) : tab === "reviews" ? (
          monthlyReviews
        ) : !authenticated ? (
          <Landing
            monthlyReviews={
              <>
                {monthlyReviews}
                <WatchGuides />
                {exploreNews}
              </>
            }
            releases={releases}
            actions={
              <>
                {emailAccounts && (
                  <>
                    <a className="primary account-link" href="/conta?modo=register">
                      Criar conta
                    </a>
                    <a className="account-link landing-login" href="/conta">
                      Já tenho conta
                    </a>
                  </>
                )}
                {inviteLogin && (
                  <button className="primary" onClick={() => signIn("keycloak", { callbackUrl: "/" })}>
                    Entrar com convite
                  </button>
                )}
              </>
            }
          />
        ) : (
          <>
            {data?.needsProfile && (
              <section className="panel">
                <h2>Crie seu perfil</h2>
                <ProfileForm busy={busy} onSave={saveProfile} />
              </section>
            )}
            {!pageTitle &&
              (tab === "ranking" ? (
                data?.profile && (
                  <FilmRanking
                    visibility={sectionVisibility("ranking", "meu ranking")}
                    films={(data.library ?? [])
                      .filter((item) => item.watched && known[item.title])
                      .map((item) => known[item.title])}
                  />
                )
              ) : tab !== "profile" ? (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <p className="eyebrow">FILMES · SÉRIES · ANIMES</p>
                      <h1>
                        Qual é a<br />
                        <em>próxima sessão?</em>
                      </h1>
                      <CatalogSearch
                        key={tab}
                        category={tab}
                        query={query}
                        onChange={(value) => {
                          setQuery(value);
                          if (!value) {
                            setSearch("");
                            setPage(1);
                          }
                        }}
                        onSearch={() => {
                          setSearch(query.trim());
                          setPage(1);
                        }}
                        onOpen={open}
                      />
                    </div>
                    <div className="reel" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                  </section>
                  <section aria-busy={loading}>
                    <div className="section-heading">
                      <h2>{search ? "Resultados da busca" : categories.find(([id]) => id === tab)?.[1]}</h2>
                      {demo && <span className="muted">Catálogo fictício</span>}
                    </div>
                    {loading ? (
                      <p>Carregando catálogo…</p>
                    ) : titles.length ? (
                      <div className="grid">
                        {titles.map((item) => (
                          <article className="catalog-card" key={item.id}>
                            <button className="card" onClick={() => open(item.id)}>
                              <Poster title={item} />
                              <CardTitle>{item.name}</CardTitle>
                              <small>
                                {item.year} · {workKind(item)}
                              </small>
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>Nenhuma obra nesta página.</p>
                    )}
                    {(page > 1 || more) && (
                      <div className="row pagination">
                        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                          Anterior
                        </button>
                        <span>Página {page}</span>
                        <button disabled={!more} onClick={() => setPage(page + 1)}>
                          Próxima
                        </button>
                      </div>
                    )}
                  </section>
                  {tab === "all" && !search && (
                    <>
                      <WatchGuides />
                      {exploreNews}
                    </>
                  )}
                </>
              ) : (
                <section>
                  <div className="section-heading profile-heading">
                    <div className="row">
                      {current?.profile && (
                        <ProfileAvatar name={current.profile.name} avatar={current.profile.avatar} />
                      )}
                      <div>
                        <h1>{current?.profile?.name ?? "Meu perfil"}</h1>
                        {current?.profile && <span className="muted">@{current.profile.username}</span>}
                      </div>
                    </div>
                  </div>
                  {!owned && current?.profile && (
                    <>
                      <ProfileFriend key={current.profile.username} username={current.profile.username} />
                      <ProfileCompatibility username={current.profile.username} name={current.profile.name} />
                    </>
                  )}
                  {owned && current?.profile && (
                    <>
                      <nav className="profile-shortcuts" aria-label="Atalhos do perfil">
                        <a className="room-nav-button" href="/conta/configuracoes">
                          Minha conta
                        </a>
                        <a className="room-nav-button" href="/ranking">
                          <UiIcon name="crown" />
                          Meu ranking
                        </a>
                        <a className="room-nav-button" href="/amigos">
                          <UiIcon name="friends" />
                          Meus amigos
                        </a>
                        <a className="room-nav-button" href="/importar">
                          <UiIcon name="import" />
                          Importar Letterboxd
                        </a>
                      </nav>
                      <div className="profile-visibility-all">
                        {sectionVisibility("all", "todas as seções")}
                        <span>
                          Visibilidade do perfil
                          <small>
                            Controle cada seção pelo ícone de olho ou use este para mostrar/ocultar todas. Avaliações
                            públicas nas obras continuam com controle próprio.
                          </small>
                        </span>
                      </div>
                    </>
                  )}
                  {owned && current?.profile && (
                    <details className="panel">
                      <summary>Editar perfil</summary>
                      <ThemePicker />
                      <ProfileForm profile={current.profile} busy={busy} onSave={saveProfile} />
                    </details>
                  )}
                  {!owned && current?.profile?.bio && <p>{current.profile.bio}</p>}
                  {current?.profile && (
                    <>
                      {!owned && <ProfileFriends key={current.profile.username} username={current.profile.username} />}
                      {showSection("watchlist") && (
                        <section className="panel">
                          <div className="section-heading">
                            <h2>Vou ver</h2>
                            {sectionVisibility("watchlist", "Vou ver")}
                          </div>
                          <LibraryPage<Entry>
                            key={current.profile.username}
                            section="watchlist"
                            diaryVisible={false}
                            dashboard={current}
                            username={owned ? undefined : current.profile.username}
                            render={(item, saved) => {
                              return (
                                <button key={item.title} className="card" onClick={() => open(item.title)}>
                                  {saved ? (
                                    <Poster title={saved} />
                                  ) : (
                                    <div className="poster art-0">
                                      <span>{label(item.title)}</span>
                                    </div>
                                  )}
                                  <CardTitle>{saved?.name ?? label(item.title)}</CardTitle>
                                  {saved && (
                                    <small>
                                      {saved.year} · {workKind(saved)}
                                    </small>
                                  )}
                                </button>
                              );
                            }}
                          />
                        </section>
                      )}
                      {showSection("watched") && (
                        <section className="panel">
                          <div className="section-heading">
                            <h2>Já vistos e avaliações</h2>
                            {sectionVisibility("watched", "já vistos")}
                          </div>
                          <LibraryPage<Entry>
                            key={current.profile.username}
                            section="watched"
                            diaryVisible={showSection("diary")}
                            dashboard={current}
                            username={owned ? undefined : current.profile.username}
                            render={(item, saved) => {
                              return (
                                <article className="catalog-card" key={item.title}>
                                  <button className="card" onClick={() => open(item.title)}>
                                    {saved ? (
                                      <Poster title={saved} />
                                    ) : (
                                      <div className="poster art-0">
                                        <span>{label(item.title)}</span>
                                      </div>
                                    )}
                                    <CardTitle>{saved?.name ?? label(item.title)}</CardTitle>
                                    {saved && (
                                      <small>
                                        {saved.year} · {workKind(saved)}
                                      </small>
                                    )}
                                  </button>
                                  <div className="diary-rating">
                                    {saved && saved.format !== "tv" && item.rating && (
                                      <span>★ {displayRating(item.rating)}</span>
                                    )}
                                    <div className="profile-card-actions">
                                      {item.review && (
                                        <ReviewReader
                                          key={[item.version, item.spoiler, item.my_vote].join("-")}
                                          name={saved?.name ?? label(item.title)}
                                          titleId={item.title}
                                          author={current.profile!.username}
                                          own={owned}
                                          watched={!!item.viewer_watched}
                                          text={item.review}
                                          version={item.version}
                                          initial={item}
                                        />
                                      )}
                                      {showSection("diary") && (
                                        <button
                                          type="button"
                                          aria-haspopup="dialog"
                                          aria-label={"Abrir Diário de " + (saved?.name ?? label(item.title))}
                                          title="Abrir Diário da obra"
                                          onClick={() => {
                                            setError("");
                                            setNotice("");
                                            setDiaryTitle({ id: item.title, name: saved?.name ?? label(item.title) });
                                          }}
                                        >
                                          <UiIcon name="diary" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </article>
                              );
                            }}
                          />
                        </section>
                      )}
                      {showSection("lists") && (
                        <ProfileLists
                          key={current.profile.username}
                          username={owned ? undefined : current.profile.username}
                          visibility={sectionVisibility("lists", "listas")}
                        />
                      )}
                      {diaryTitle && showSection("diary") && (
                        <DiaryDialog
                          key={diaryTitle.id}
                          title={diaryTitle.id}
                          name={diaryTitle.name}
                          dashboard={current}
                          username={owned ? undefined : current.profile?.username}
                          onClose={() => setDiaryTitle(null)}
                          visibility={sectionVisibility("diary", "diário")}
                          message={viewing ? "" : error || notice}
                          renderSession={(item) => (
                            <li key={item.id}>
                              <span>
                                {item.watched_on?.split("-").reverse().join("/") ?? "Data não informada"}
                                {item.watched_at && (
                                  <>
                                    {" "}
                                    às{" "}
                                    <time dateTime={item.watched_at}>
                                      {sessionTime.format(new Date(item.watched_at))}
                                    </time>
                                  </>
                                )}
                                {item.rewatch ? " · Revisto" : ""}
                              </span>
                              {owned && (
                                <div className="diary-actions">
                                  <button
                                    type="button"
                                    aria-label={"Editar sessão de " + diaryTitle.name}
                                    title="Editar sessão"
                                    disabled={busy}
                                    onClick={() => {
                                      setError("");
                                      setViewing(item);
                                    }}
                                  >
                                    <UiIcon name="edit" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={"Excluir sessão de " + diaryTitle.name}
                                    title="Excluir sessão"
                                    disabled={busy}
                                    onClick={() => {
                                      if (confirm("Excluir a sessão de " + diaryTitle.name + " do Diário?"))
                                        void action(
                                          () => api("me/viewings/" + item.id, "DELETE"),
                                          "Registro excluído.",
                                        );
                                    }}
                                  >
                                    <UiIcon name="trash" />
                                  </button>
                                </div>
                              )}
                            </li>
                          )}
                        />
                      )}
                      {!owned && showSection("ranking") && (
                        <section className="panel">
                          <h2>
                            <UiIcon name="crown" /> Ranking
                          </h2>
                          {rankingGroups.map(([kind, label]) => (
                            <div key={kind}>
                              <h3>{label}</h3>
                              {rankingCategories.map((category, tier) => (
                                <div className={"public-ranking-tier rank-tier-" + tier} key={tier}>
                                  <h4>{category}</h4>
                                  <div className="public-ranking-cards">
                                    {current.ranking
                                      ?.filter(
                                        (item) =>
                                          item.tier === tier &&
                                          known[item.title] &&
                                          rankingGroup(known[item.title]) === kind,
                                      )
                                      .map((item) => (
                                        <div className="catalog-card" key={item.title}>
                                          {savedCard(item.title)}
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </section>
                      )}
                      {!owned && !profileSections.some((key) => current.visibility?.[key]) && (
                        <p className="muted">As seções deste perfil estão privadas.</p>
                      )}
                    </>
                  )}
                </section>
              ))}
          </>
        )}
        {title && (
          <section ref={detail} tabIndex={-1} className="panel detail" aria-label="Detalhes da obra">
            <div className="section-heading work-detail-heading">
              <h2>Detalhes</h2>
              {((title.format === "tv" && seriesComplete === true) || (title.format === "seas" && seasonComplete)) && (
                <span className="work-completion-badge" role="status">
                  <Icon kind="watched" active />
                  Vi completamente
                </span>
              )}
            </div>
            {seriesPart && (
              <nav className="work-back-links" aria-label="Navegação da série">
                <Link className="room-nav-button" href={workHref(seriesPart.seriesId)}>
                  {seriesPart.episode === undefined && <UiIcon name="back" />}Voltar à série
                </Link>
                {seriesPart.episode !== undefined && (
                  <Link className="room-nav-button" href={seasonHref(seriesPart.seriesId, seriesPart.season)}>
                    <UiIcon name="back" />
                    {seriesPart.season === 0 ? "Voltar aos especiais" : "Voltar à temporada"}
                  </Link>
                )}
              </nav>
            )}
            <div className="detail-grid">
              <Poster title={title} large />
              <div>
                <p className="eyebrow">
                  {seriesPart
                    ? seasonName(seriesPart.season) +
                      (seriesPart.episode === undefined ? "" : " · Episódio " + seriesPart.episode)
                    : workKind(title).toLocaleUpperCase("pt-BR") + " · " + (title.year || "ANO INDISPONÍVEL")}
                </p>
                <h2>{title.name}</h2>
                <p>{title.summary || "Sinopse indisponível."}</p>
                <FilmFacts title={title} />
                {data?.profile && (
                  <>
                    <div className="row">
                      {title.format === "seas" ? (
                        !seasonComplete && (
                          <span className="season-watch-status">
                            <Icon kind="watched" active={anyEpisodeWatched} />
                            {anyEpisodeWatched ? "Já vi" : "Ainda não vi"}
                          </span>
                        )
                      ) : (
                        <IconAction
                          kind="watched"
                          active={entry.watched}
                          disabled={busy || reviewPending}
                          label={entry.watched ? "Já vi" : "Não vi"}
                          onClick={() => {
                            void update("watched", { value: !entry.watched });
                          }}
                        />
                      )}
                      {title.format === "tv" && seriesComplete === "unavailable" && (
                        <span className="muted" role="status">
                          Não foi possível verificar se você viu a série completamente.
                        </span>
                      )}
                      {(!entry.watched || entry.interest) && (
                        <IconAction
                          kind="interest"
                          active={entry.interest}
                          disabled={busy}
                          label={entry.interest ? "No Vou ver" : "Vou ver"}
                          onClick={() => {
                            void update("interest", { value: !entry.interest });
                          }}
                        />
                      )}
                      {title.format === "seas" ? (
                        <span className="season-watch-status" role="status" data-complete={!!seasonProgress?.rewatched}>
                          <Icon kind="rewatching" active={!!seasonProgress?.rewatched} />
                          {seasonProgress?.rewatched ? "Vi novamente" : "Ainda não revi"}
                        </span>
                      ) : (
                        entry.watched && (
                          <IconAction
                            kind="rewatching"
                            active={entry.rewatching}
                            disabled={busy}
                            label={entry.rewatching ? "Vi novamente" : "Sem revisualização"}
                            onClick={() => {
                              void update("rewatching", { value: !entry.rewatching });
                            }}
                          />
                        )
                      )}
                      {(entry.watched || seasonProgress?.rewatched) && (
                        <button
                          disabled={busy || (title.format === "seas" ? !seasonProgress?.rewatched : !entry.rewatching)}
                          aria-haspopup="dialog"
                          onClick={() => {
                            setError("");
                            setPendingViewing({
                              title: title.id,
                              name: title.name,
                              watchedAt: new Date().toISOString(),
                            });
                          }}
                        >
                          Registrar sessão
                        </button>
                      )}
                    </div>
                    {title.format === "seas" && (
                      <div className="season-progress-summary">
                        {progressError ? (
                          <p role="alert">
                            {progressError}{" "}
                            <button type="button" onClick={() => setProgressRetry((value) => value + 1)}>
                              Tentar novamente
                            </button>
                          </p>
                        ) : seasonProgress ? (
                          <p role="status">
                            {seasonProgress.watched} de {seasonProgress.total} episódios vistos
                            {seasonProgress.average !== null && (
                              <>
                                {" "}
                                · Minha média <strong>★ {seasonProgress.average.toLocaleString("pt-BR")} / 5</strong>
                              </>
                            )}
                          </p>
                        ) : (
                          <p role="status">Carregando progresso…</p>
                        )}
                      </div>
                    )}
                    <div className="row title-social-actions">
                      <AddToCollection key={"collection-" + title.id} titleId={title.id} name={title.name} />
                      <RecommendTitle
                        key={"recommend-" + title.id}
                        titleId={title.id}
                        name={title.name}
                        username={data.profile.username}
                      />
                    </div>
                    {entry.watched && (
                      <div className="form">
                        {title.format === "tv" ? (
                          seriesScore ? (
                            <p>
                              <strong>Minha média</strong> · ★ {seriesScore.average.toLocaleString("pt-BR")} / 5 ·{" "}
                              {rankingCategories[seriesScore.tier]}
                            </p>
                          ) : (
                            <p className="muted">Avalie os episódios para calcular a nota e a categoria da série.</p>
                          )
                        ) : (
                          title.format !== "seas" && rankControl(title.id)
                        )}
                        {title.format !== "tv" && title.format !== "seas" && (
                          <StarRating
                            key={title.id}
                            disabled={busy}
                            value={entry.rating}
                            onChange={(rating) => {
                              void update("rating", { rating });
                            }}
                          />
                        )}
                        <ReviewEditor
                          key={title.id}
                          title={title.id}
                          initial={entry}
                          disabled={busy}
                          onPending={setReviewPending}
                          onSaved={async () => {
                            await refresh();
                            await refreshCommunity(title.id);
                          }}
                          visibility={visibilityControl({ ...entry, title: title.id })}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {title.format === "tv" && <SeriesSeasons key={title.id} title={title.id} />}
            {chronology}
            {!!title.details?.people?.length && <WorkPeople people={title.details.people} titleId={title.id} />}
            {data?.profile && <TitleFriends key={title.id} titleId={title.id} watched={entry.watched} />}
            {community && (
              <section className="community" aria-labelledby="community-heading">
                <h3 id="community-heading">Comunidade</h3>
                <CommunityScore
                  average={community.average}
                  count={community.rating_count}
                  episodic={title.format === "tv" || title.format === "seas"}
                />
                {(title.format === "tv" || title.format === "seas") && (
                  <p className="muted">
                    {title.format === "seas" ? "Média dos episódios avaliados" : "Média das temporadas avaliadas"} ·{" "}
                    {community.episode_rating_count ?? 0} notas registradas
                  </p>
                )}
                <h4>Resenhas</h4>
                {!community.reviews.length && <p className="muted">Nenhuma resenha publicada.</p>}
                {community.reviews.map((review) => (
                  <article className="record" key={review.username}>
                    <div className="row review-author">
                      <button
                        className="review-author-link"
                        disabled={review.username === data?.profile?.username}
                        onClick={() => visit(review.username)}
                      >
                        <ProfileAvatar name={review.name} avatar={review.avatar} />
                        {review.name}
                      </button>
                      {title.format !== "tv" && review.rating !== null && (
                        <span className="review-score">★ {displayRating(review.rating)}</span>
                      )}
                    </div>
                    <ReviewReader
                      key={[title.id, review.version, review.spoiler, review.my_vote].join("-")}
                      titleId={title.id}
                      author={review.username}
                      own={review.username === data?.profile?.username}
                      watched={entry.watched}
                      text={review.review}
                      version={review.version}
                      initial={review}
                    />
                    <ReviewSocial
                      key={[title.id, review.username, review.likes, review.liked, review.comments].join("-")}
                      titleId={title.id}
                      author={review.username}
                      own={review.username === data?.profile?.username}
                      initial={review}
                    />
                  </article>
                ))}
                {showCommunityDemo && (
                  <section className="community" aria-label="Comunidade de demonstração">
                    <h4>Comunidade de demonstração</h4>
                    {title.format === "tv" ? (
                      <>
                        <CommunityScore
                          average={
                            demoEpisodeRatings.reduce((sum, item) => sum + item.rating, 0) /
                            demoEpisodeRatings.length /
                            2
                          }
                          count={new Set(demoEpisodeRatings.map((item) => item.viewer)).size}
                          demo
                          episodic
                        />
                        <p className="muted">{demoEpisodeRatings.length} notas fictícias por episódio</p>
                        {demoEpisodeRatings.map((item) => (
                          <div className="record row review-author" key={item.viewer + "-" + item.episode}>
                            <ProfileAvatar name={item.viewer} />
                            <strong>{item.viewer}</strong>
                            <span>Temp. 1 · Ep. {item.episode}</span>
                            <span className="review-score">★ {displayRating(item.rating)}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <CommunityScore
                        average={demoSum / demoEvaluations.length / 2}
                        count={demoEvaluations.length}
                        demo
                      />
                    )}
                    {title.format !== "tv" &&
                      demoEvaluations
                        .filter((item) => item.review)
                        .map((item) => (
                          <article className="record" key={item.name}>
                            <div className="row review-author">
                              <ProfileAvatar name={item.name} />
                              <CardTitle>{item.name}</CardTitle>
                              <span className="review-score">★ {displayRating(item.rating)}</span>
                            </div>
                            <Spoiler hidden={!entry.watched && item.spoiler}>{item.review}</Spoiler>
                          </article>
                        ))}
                  </section>
                )}
              </section>
            )}
          </section>
        )}
        {title?.format === "seas" && seriesPart && (
          <EpisodeRatings
            key={title.id}
            title={seriesPart.seriesId}
            season={seriesPart.season}
            allowRating={!!data?.profile && entry.watched}
            onSaved={() => {
              void refreshCommunity(title.id);
              void refresh().catch(fail);
            }}
          />
        )}
        <dialog
          className="session-dialog"
          ref={sessionDialog}
          aria-labelledby="session-heading"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) {
              setPendingViewing(null);
              setError("");
            }
          }}
        >
          {pendingViewing && (
            <>
              <h2 id="session-heading">Registrar sessão?</h2>
              <p>
                Adicionar uma revisualização de <strong>{pendingViewing.name}</strong> ao{" "}
                <strong className="profile-section-name">Diário</strong>, em{" "}
                {sessionDate.format(new Date(pendingViewing.watchedAt))}?
              </p>
              {error && (
                <p role="alert" className="message error">
                  {error}
                </p>
              )}
              <div className="row">
                <button
                  type="button"
                  autoFocus
                  disabled={busy}
                  onClick={() => {
                    setPendingViewing(null);
                    setError("");
                  }}
                >
                  Cancelar
                </button>
                <button type="button" className="primary" disabled={busy} onClick={confirmViewing}>
                  {busy ? "Registrando…" : "Confirmar"}
                </button>
              </div>
            </>
          )}
        </dialog>
        <dialog
          className="session-dialog"
          ref={viewingDialog}
          aria-labelledby="edit-viewing-heading"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) {
              setViewing(null);
              setError("");
            }
          }}
        >
          {viewing && (
            <>
              <h2 id="edit-viewing-heading">Editar sessão</h2>
              <p>{diaryTitle?.id === viewing.title ? diaryTitle.name : label(viewing.title)}</p>
              {error && (
                <p role="alert" className="message error">
                  {error}
                </p>
              )}
              <form
                key={viewing.id}
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const body = { title: viewing.title, date: form.get("date") || null, rewatch: form.has("rewatch") };
                  void action(async () => {
                    await api("me/viewings/" + viewing.id, "PUT", body);
                    setViewing(null);
                  }, "Sessão salva.");
                }}
              >
                <label>
                  Data (opcional)
                  <input autoFocus disabled={busy} name="date" type="date" defaultValue={viewing.watched_on ?? ""} />
                </label>
                <label className="check">
                  <input disabled={busy} name="rewatch" type="checkbox" defaultChecked={viewing.rewatch} />
                  Já tinha visto antes
                </label>
                <div className="row">
                  <button className="primary" disabled={busy}>
                    Salvar sessão
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setViewing(null);
                      setError("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </>
          )}
        </dialog>
        {credits && <CreditsPanel />}
      </main>
      <footer className="wrap footer">
        <span>Cena Aberta · Alpha</span>
        <button onClick={() => setCredits(!credits)}>Sobre, créditos e privacidade</button>
      </footer>
    </>
  );
}
