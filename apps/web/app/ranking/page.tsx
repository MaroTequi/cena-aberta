import { requireProfile } from "../../lib/profile";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, emailAccounts } from "../../lib/auth";
import { App } from "../app";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  await requireProfile(session.actor);
  return (
    <App
      authenticated
      inviteLogin={Boolean(process.env.OIDC_ISSUER)}
      emailAccounts={emailAccounts}
      initialTab="ranking"
    />
  );
}
