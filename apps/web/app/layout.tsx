import type { Metadata } from "next";
import "./style.css";
import "./christmas.css";
import { ThemeSync } from "./theme-picker";
import { FeedbackWidget } from "./feedback-widget";
import { version } from "../package.json";
export const metadata: Metadata = { title: "Cena Aberta", description: "Seu diário de filmes, séries e animes." };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-christmas="on" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var storage;try{storage=localStorage.getItem('cena.preference-storage')==='off'?sessionStorage:localStorage}catch{storage=sessionStorage};var t=storage.getItem('cena-theme');document.documentElement.dataset.christmas=storage.getItem('cena-christmas')==='off'?'off':'on';document.documentElement.dataset.theme=t==='light'?'light':t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):'dark'}catch{}`,
          }}
        />
      </head>
      <body>
        {children}
        <ThemeSync />
        <FeedbackWidget version={version} />
      </body>
    </html>
  );
}
