"use client";
import { useEffect, useId, useState } from "react";

type Suggestion = { id: string; name: string; year: string; format: string; anime: boolean };
type Props = {
  category: string;
  query: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onOpen: (id: string) => void;
};

export function CatalogSearch({ category, query, onChange, onSearch, onOpen }: Props) {
  const listId = useId();
  const term = query.trim();
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ term: string; category: string; items: Suggestion[] } | null>(null);
  const items = open && result?.term === term && result.category === category ? result.items : [];
  useEffect(() => {
    if (!open || term.length < 2) return;
    const request = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: category, query: term, page: "1" });
        const response = await fetch("/api/v1/titles?" + params, { cache: "no-store", signal: request.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!request.signal.aborted) setResult({ term, category, items: data.items.slice(0, 6) });
      } catch {
        /* A full search remains available if suggestions cannot be loaded. */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [open, term, category]);
  function close() {
    setOpen(false);
    setActive(-1);
  }
  function select(id: string) {
    close();
    onOpen(id);
  }
  return (
    <form
      className="search catalog-search"
      role="search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        close();
        onSearch();
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-label="Buscar por título"
        aria-autocomplete="list"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-activedescendant={items[active] ? listId + "-" + active : undefined}
        autoComplete="off"
        placeholder="Buscar por título…"
        maxLength={100}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
          setResult(null);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
          }
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && term.length >= 2) {
            e.preventDefault();
            setOpen(true);
            if (items.length)
              setActive((i) => (e.key === "ArrowDown" ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1));
          }
          if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            select(items[active].id);
          }
        }}
      />
      <button className="primary" type="submit">
        Buscar
      </button>
      <ul
        className="catalog-suggestions"
        id={listId}
        role="listbox"
        aria-label="Sugestões de obras"
        hidden={!items.length}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            id={listId + "-" + index}
            role="option"
            aria-selected={active === index}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(item.id)}
          >
            <strong>{item.name}</strong>
            <small>
              {[item.anime ? "Anime" : item.format === "movie" ? "Filme" : "Série", item.year]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </li>
        ))}
      </ul>
    </form>
  );
}
