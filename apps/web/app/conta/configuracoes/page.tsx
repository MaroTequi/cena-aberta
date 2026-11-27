import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, emailAccounts } from "../../../lib/auth";
import { AccountSettings } from "./settings";
export default async function Page() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta?next=/conta/configuracoes");
  return <AccountSettings supported={emailAccounts} />;
}
