import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { requireProfile } from "../../lib/profile";
import { parseTab, searchHref } from "../../lib/search";
import { UserPageHeader } from "../user-pages";
import { CentralSearch } from "./search";

export const metadata: Metadata = { title: "Buscar · Cena Aberta" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const { q, tipo } = await searchParams;
  const query = (q ?? "").slice(0, 100);
  const tab = parseTab(tipo);
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta?next=" + encodeURIComponent(searchHref(query, tab)));
  await requireProfile(session.actor, searchHref(query, tab));
  return (
    <>
      <UserPageHeader current="/busca" />
      <CentralSearch key={tab + ":" + query} initialQuery={query} initialTab={tab} />
    </>
  );
}
