import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { Suspense } from "react";
import { authOptions, emailAccounts } from "../../lib/auth";
import { requireProfile } from "../../lib/profile";
import { App } from "../app";
import { MonthlyReviews } from "../monthly-reviews";

export const metadata: Metadata = { title: "Resenhas · Cena Aberta" };

export default async function ReviewsPage() {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  const viewer = session?.actor;
  if (viewer) await requireProfile(viewer, "/resenhas");
  return (
    <App
      initialTab="reviews"
      authenticated={Boolean(viewer)}
      inviteLogin={Boolean(process.env.OIDC_ISSUER)}
      emailAccounts={emailAccounts}
      monthlyReviews={
        <Suspense fallback={<p role="status">Carregando resenhas…</p>}>
          <MonthlyReviews viewer={viewer} />
        </Suspense>
      }
    />
  );
}
