import { notFound } from "next/navigation";
import { authOptions, emailAccounts } from "../../../../../../lib/auth";
import { App } from "../../../../../app";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { requireProfile } from "../../../../../../lib/profile";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; season: string; episode: string }>;
}) {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  await requireProfile(session.actor);

  const { id, season, episode } = await params;
  if (
    !/^(?:demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12})$/.test(id) ||
    !/^(0|[1-9][0-9]{0,2}|1000)$/.test(season) ||
    !/^[1-9][0-9]{0,8}$/.test(episode)
  )
    notFound();

  return (
    <App
      authenticated
      inviteLogin={Boolean(process.env.OIDC_ISSUER)}
      emailAccounts={emailAccounts}
      pageTitle={"ep-" + id + "-s" + season + "-e" + episode}
      seriesPart={{ seriesId: id, season: Number(season), episode: Number(episode) }}
    />
  );
}
