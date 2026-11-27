import { requireProfile } from "../lib/profile";
import { getServerSession } from "next-auth";
import { authOptions, emailAccounts } from "../lib/auth";
import { recentReleases } from "../lib/releases";
import { LandingNews } from "./noticias/landing-news";
import { MonthlyReviews } from "./monthly-reviews";
import { Suspense } from "react";
import { App } from "./app";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string; usuario?: string }> }) {
  const query = await searchParams;
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (session?.actor) await requireProfile(session.actor);
  const initialTab = query.usuario
    ? "profile"
    : ["all", "movie", "tv", "anime", "profile"].includes(query.aba ?? "")
      ? query.aba!
      : "all";
  const releases = session?.actor ? [] : await recentReleases();
  return (
    <App
      monthlyReviews={
        !session?.actor && (
          <Suspense fallback={<p role="status">Carregando resenhas…</p>}>
            <MonthlyReviews />
          </Suspense>
        )
      }
      exploreNews={
        <Suspense fallback={<p role="status">Carregando notícias…</p>}>
          <LandingNews />
        </Suspense>
      }
      releases={releases}
      authenticated={Boolean(session?.actor)}
      inviteLogin={Boolean(process.env.OIDC_ISSUER)}
      emailAccounts={emailAccounts}
      initialTab={initialTab}
      profileUser={query.usuario}
    />
  );
}
