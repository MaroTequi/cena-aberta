import type {Metadata} from "next";
import {getServerSession} from "next-auth";
import {authOptions,emailAccounts} from "../../lib/auth";
import {requireProfile} from "../../lib/profile";
import {App} from "../app";

export const metadata:Metadata={title:"Recomendações · Cena Aberta"};

export default async function RecommendationsPage() {
  const session=await getServerSession(authOptions) as {actor?:string}|null;
  const viewer=session?.actor;
  if(viewer)await requireProfile(viewer,"/recomendacoes");
  return <App initialTab="recommendations" authenticated={Boolean(viewer)}
    inviteLogin={Boolean(process.env.OIDC_ISSUER)} emailAccounts={emailAccounts}/>;
}
