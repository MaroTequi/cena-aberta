import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { requireProfile } from "../../lib/profile";
import { FriendsFeed } from "./feed";
export const metadata: Metadata = { title: "Mural · Cena Aberta" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta?next=/feed");
  await requireProfile(session.actor, "/feed");
  return <FriendsFeed />;
}
