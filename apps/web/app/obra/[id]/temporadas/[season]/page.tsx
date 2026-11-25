import {getServerSession} from "next-auth";
import {notFound,redirect} from "next/navigation";
import {authOptions,emailAccounts} from "../../../../../lib/auth";
import {requireProfile} from "../../../../../lib/profile";
import {App} from "../../../../app";

export default async function SeasonPage({params}: {params:Promise<{id:string; season:string}>}) {
  const session=await getServerSession(authOptions) as {actor?:string}|null;
  if(!session?.actor)redirect("/conta");
  await requireProfile(session.actor);

  const {id,season}=await params;
  if(!/^(demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12})$/.test(id)||!/^(0|[1-9][0-9]{0,2}|1000)$/.test(season))notFound();

  return <App authenticated inviteLogin={Boolean(process.env.OIDC_ISSUER)} emailAccounts={emailAccounts}
    pageTitle={"season-"+id+"-s"+season}
    seriesPart={{seriesId:id,season:Number(season)}}/>;
}
