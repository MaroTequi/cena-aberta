import { requireProfile } from "../../../lib/profile";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions, emailAccounts } from "../../../lib/auth";
import { Suspense } from "react";
import { Chronology } from "../chronology";
import { App } from "../../app";
export const dynamic = "force-dynamic";
export default async function Obra({ params }: { params: Promise<{ id: string }> }) {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  await requireProfile(session.actor);
  const { id } = await params;
  if (!/^(demo-[a-z0-9-]+|tmdb-(movie|tv)-[0-9]+)$/.test(id)) notFound();
  return (
    <App
      authenticated
      inviteLogin={Boolean(process.env.OIDC_ISSUER)}
      emailAccounts={emailAccounts}
      chronology={
        id.startsWith("tmdb-") ? (
          <Suspense fallback={<p role="status">Consultando cronologia…</p>}>
            <Chronology id={id} />
          </Suspense>
        ) : null
      }
      pageTitle={id}
      showCommunityDemo={process.env.COMMUNITY_DEMO_TITLE === id}
    />
  );
}
