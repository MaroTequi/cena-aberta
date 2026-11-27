import { UserPageHeader } from "../user-pages";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { requireProfile } from "../../lib/profile";
import { LetterboxdImporter } from "./importer";
export const dynamic = "force-dynamic";
export default async function ImportPage() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  await requireProfile(session.actor);
  return (
    <>
      <UserPageHeader />
      <LetterboxdImporter />
    </>
  );
}
