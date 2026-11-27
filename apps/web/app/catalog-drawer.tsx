"use client";
import { useEffect, useRef, useState } from "react";
export function CatalogDrawer({
  categories,
  current,
  onSelect,
}: {
  categories: string[][];
  current: string;
  onSelect: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  function close() {
    dialog.current?.close();
  }
  useEffect(() => {
    const media = matchMedia("(min-width:651px)");
    const resize = () => {
      if (media.matches) dialog.current?.close();
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  return (
    <div className="catalog-drawer">
      <button
        ref={trigger}
        type="button"
        className="catalog-drawer-trigger"
        aria-label="Catálogo"
        title="Catálogo"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="catalog-drawer"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        id="catalog-drawer"
        aria-labelledby="catalog-drawer-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const r = e.currentTarget.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
          }
        }}
      >
        <div className="catalog-drawer-heading">
          <h2 id="catalog-drawer-title">O que vamos ver?</h2>
          <button type="button" autoFocus aria-label="Fechar categorias" onClick={close}>
            ×
          </button>
        </div>
        <div className="catalog-drawer-options">
          {categories.map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-current={current === id ? "page" : undefined}
              onClick={() => {
                close();
                onSelect(id);
              }}
            >
              {name}
              <span aria-hidden="true">{current === id ? "✓" : "→"}</span>
            </button>
          ))}
        </div>
      </dialog>
    </div>
  );
}
