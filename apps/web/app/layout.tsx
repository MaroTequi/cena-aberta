import type { Metadata } from "next";
import "./style.css";
import "./user-features.css";
import { ThemeSync } from "./theme-picker";
import { FeedbackWidget } from "./feedback-widget";
import { version } from "../package.json";
export const metadata: Metadata = { title: "Cena Aberta", description: "Seu diário de filmes, séries e animes." };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t;try{t=(localStorage.getItem('cena.preference-storage')==='off'?sessionStorage:localStorage).getItem('cena-theme')}catch{t=sessionStorage.getItem('cena-theme')};document.documentElement.dataset.theme=t==='light'?'light':t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):'dark'}catch{}`,
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
