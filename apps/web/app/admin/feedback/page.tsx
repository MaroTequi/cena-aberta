import { UserPageHeader } from "../../user-pages";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { FeedbackInbox } from "./inbox";
export const dynamic = "force-dynamic";
export default async function AdminFeedback() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  const r = await fetch((process.env.SOCIAL_URL ?? "http://127.0.0.1:8182") + "/feedback/access", {
    headers: { "X-Actor": session.actor, "X-Internal-Key": process.env.SOCIAL_INTERNAL_SECRET ?? "" },
    cache: "no-store",
  });
  if (!r.ok || !(await r.json()).admin) redirect("/");
  return (
    <>
      <UserPageHeader />
      <FeedbackInbox />
    </>
  );
}
