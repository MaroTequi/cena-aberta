import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { profileState } from "../../../lib/profile";
import { CompleteProfile } from "./complete-profile";
export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  if (!(await profileState(session.actor)).needsProfile) redirect("/");
  return <CompleteProfile />;
}
