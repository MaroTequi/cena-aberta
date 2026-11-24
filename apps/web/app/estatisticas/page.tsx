import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { requireProfile } from "../../lib/profile";
import { StatsPage } from "./stats";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta?next=/estatisticas");
  await requireProfile(session.actor, "/estatisticas");
  return <StatsPage />;
}
