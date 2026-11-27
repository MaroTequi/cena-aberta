"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/client-api";

/** Versão do trailer: dublado, em português ou legendado no Brasil, idioma original ou versão de Portugal. */
type Version = { key: string; name: string; version: "dubbed" | "portuguese" | "subtitled" | "original" | "portugal" };
/** Trailer escolhido pelo catálogo (key null quando a obra não tem) e as versões disponíveis. */
type Trailer = { key: string | null; name: string | null; language: string | null; versions: Version[] };

/** Nome curto de cada versão, para os botões e o rótulo do botão da página. */
export const versionLabels: Record<Version["version"], string> = {
  dubbed: "Dublado",
  portuguese: "Português",
  subtitled: "Legendado",
  original: "Original",
  portugal: "Portugal",
};

/**
 * Botão "Ver trailer" da página da obra e a janela com o player. O catálogo já manda primeiro a versão
 * dublada no Brasil; quando há outras versões, a janela deixa trocar. No original, a legenda em português
 * vem ligada quando o YouTube tem. O vídeo só carrega
 * ao abrir, pelo YouTube sem cookies, e sai da página ao fechar, parando o som.
 * Sem trailer (ou com o catálogo fora), o botão não aparece.
 * @param titleId id do filme ou da série
 * @param titleName nome da obra, mostrado no topo da janela
 */
export function TrailerButton({ titleId, titleName }: { titleId: string; titleName: string }) {
  const [trailer, setTrailer] = useState<Trailer | null>(null),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(0),
    [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    api<Trailer>("titles/" + titleId + "/trailer")
      .then((found) => {
        if (active) setTrailer(found);
      })
      .catch(() => {
        // Trailer é um extra: se o catálogo falhar, a página segue sem o botão.
      });
    return () => {
      active = false;
    };
  }, [titleId]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  if (!trailer?.key) return null;
  const versions: Version[] = trailer.versions?.length
    ? trailer.versions
    : [{ key: trailer.key, name: trailer.name ?? "Trailer", version: "original" }];
  const current = versions[Math.min(selected, versions.length - 1)];
  return (
    <>
      <button
        type="button"
        className="trailer-button"
        onClick={() => {
          setSelected(0);
          setLoaded(false);
          setOpen(true);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
        </svg>
        Ver trailer
        <span className="trailer-button-version">{versionLabels[versions[0].version]}</span>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="trailer-dialog"
          aria-labelledby="trailer-heading"
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close();
          }}
        >
          <header className="trailer-header">
            <div>
              <span className="trailer-eyebrow">Trailer</span>
              <h2 id="trailer-heading">{titleName}</h2>
            </div>
            <button
              type="button"
              className="trailer-close"
              autoFocus
              aria-label="Fechar trailer"
              onClick={() => dialog.current?.close()}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          <div className="trailer-frame" data-loaded={loaded}>
            {!loaded && (
              <p className="trailer-loading" role="status">
                Carregando trailer…
              </p>
            )}
            <iframe
              key={current.key}
              src={
                "https://www.youtube-nocookie.com/embed/" +
                current.key +
                "?autoplay=1&rel=0&hl=pt-BR&cc_lang_pref=pt" +
                (current.version === "original" ? "&cc_load_policy=1" : "")
              }
              title={"Trailer de " + titleName + " (" + versionLabels[current.version] + ")"}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setLoaded(true)}
            />
          </div>
          <footer className="trailer-footer">
            {versions.length > 1 ? (
              <div className="trailer-versions" role="group" aria-label="Versão do trailer">
                {versions.map((version, index) => (
                  <button
                    key={version.key}
                    type="button"
                    aria-pressed={version.key === current.key}
                    onClick={() => {
                      if (index === selected) return;
                      setLoaded(false);
                      setSelected(index);
                    }}
                  >
                    {versionLabels[version.version]}
                  </button>
                ))}
              </div>
            ) : (
              <span className="trailer-version-only">{versionLabels[current.version]}</span>
            )}
            <span className="trailer-video-name" title={current.name}>
              {current.name}
            </span>
            <a
              className="trailer-youtube"
              href={"https://www.youtube.com/watch?v=" + current.key}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir no YouTube
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
          </footer>
        </dialog>
      )}
    </>
  );
}
