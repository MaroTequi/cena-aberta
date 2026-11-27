import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { requireProfile } from "../../../lib/profile";
import { CollectionPage } from "./collection";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  const next = "/colecoes/" + id;
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta?next=" + encodeURIComponent(next));
  await requireProfile(session.actor, next);
  return <CollectionPage id={id} />;
}
