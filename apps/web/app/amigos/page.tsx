import { UserPageHeader } from "../user-pages";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { requireProfile } from "../../lib/profile";
import { FriendsPanel } from "./friends";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  const profile = await requireProfile(session.actor, "/amigos");
  return (
    <>
      <UserPageHeader knownProfile={{ name: profile.name, avatar: profile.avatar }} />
      <FriendsPanel profile={profile} />
    </>
  );
}
