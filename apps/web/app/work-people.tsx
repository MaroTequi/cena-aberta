import {UiIcon} from "./ui-icons";

export type PersonCredit={id:number;name:string;photo:string|null;roles:string[];castMember:boolean};
const jobs:Record<string,string>={
  Director:"Direção",Creator:"Criação",Producer:"Produção","Executive Producer":"Produção executiva",
  Writer:"Roteiro",Screenplay:"Roteiro",Story:"História",Editor:"Montagem",Acting:"Atuação",
  "Director of Photography":"Direção de fotografia","Production Design":"Design de produção",
  "Original Music Composer":"Trilha sonora","Art Direction":"Direção de arte","Costume Design":"Figurino",
  Casting:"Seleção de elenco","Co-Producer":"Coprodução","Associate Producer":"Produção associada",
  "Line Producer":"Produção de linha","Animation Director":"Direção de animação","Sound Director":"Direção de som",
  "Character Designer":"Design de personagens","Key Animation":"Animação-chave","Series Composition":"Composição da série",
  Novel:"Romance original",Characters:"Personagens",Self:"Participação como si"
};
export function roleLabel(role:string){return jobs[role]??role;}
export function Portrait({name,photo}:{name:string;photo:string|null}){
  return photo?<img className="credit-photo" src={photo} alt="" loading="lazy"/>:
    <span className="credit-photo credit-initial" aria-hidden="true">{Array.from(name)[0]}</span>;
}
const priority=["Creator","Director","Producer","Executive Producer","Screenplay","Writer"];
function order(person:PersonCredit){
  const index=priority.findIndex(role=>person.roles.includes(role));
  return index<0?priority.length:index;
}
export function WorkPeople({people,titleId}:{people:PersonCredit[];titleId:string}){
  function group(heading:string,icon:"friends"|"room",list:PersonCredit[]){
    if(!list.length)return null;
    const cards=(rows:PersonCredit[])=><ul className="credit-grid">{rows.map(person=><li key={person.id}>
      <a className="credit-card" href={"/pessoa/"+person.id+"?obra="+encodeURIComponent(titleId)}>
        <Portrait name={person.name} photo={person.photo}/><span><strong>{person.name}</strong>
        <small>{person.roles.map(roleLabel).join(" · ")}</small></span>
      </a></li>)}</ul>;
    return <details className="work-credits"><summary><UiIcon name={icon}/>{heading}</summary>{cards(list.slice(0,8))}
      {list.length>8&&<details><summary>Ver mais {list.length-8} créditos</summary>{cards(list.slice(8))}</details>}
    </details>;
  }
  return <>{group("Elenco","friends",people.filter(p=>p.castMember))}
    {group("Equipe de produção","room",people.filter(p=>!p.castMember).sort((a,b)=>order(a)-order(b)))}</>;
}
