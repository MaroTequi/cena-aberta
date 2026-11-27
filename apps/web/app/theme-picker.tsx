"use client";
import { UiIcon } from "./ui-icons";
import { useEffect, useSyncExternalStore } from "react";
import { readPreference, writePreference, subscribePreferences, preferenceDuration } from "../lib/browser-preferences";
type Theme = "dark" | "light" | "system";
function savedTheme(): Theme {
  try {
    const value = readPreference("cena-theme");
    if (value === "light" || value === "system") return value;
  } catch {}
  return "dark";
}
function christmasEnabled() {
  return readPreference("cena-christmas") !== "off";
}
export function ThemeSync() {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.christmas = christmasEnabled() ? "on" : "off";
      const theme = savedTheme();
      document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    const unsubscribe = subscribePreferences(apply);
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      unsubscribe();
    };
  }, []);
  return null;
}
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribePreferences, savedTheme, () => "dark");
  const christmas = useSyncExternalStore(subscribePreferences, christmasEnabled, () => true);
  const duration = useSyncExternalStore(subscribePreferences, preferenceDuration, () => "persistent");
  function choose(value: Theme) {
    writePreference("cena-theme", value);
  }
  const options = [
    { value: "dark", label: "Escuro" },
    { value: "light", label: "Claro" },
    { value: "system", label: "Sistema" },
  ] as const;
  return (
    <fieldset className="theme-picker">
      <legend>Aparência</legend>
      <div className="theme-options">
        {options.map((option) => (
          <label
            className="theme-option"
            key={option.value}
            title={option.label + (theme === option.value ? " · selecionado" : "")}
          >
            <input
              type="radio"
              name="appearance"
              value={option.value}
              checked={theme === option.value}
              onChange={() => choose(option.value)}
              aria-label={option.label}
            />
            <span>
              <svg
                width="23"
                height="23"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {option.value === "dark" ? (
                  <path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z" />
                ) : option.value === "light" ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="4" width="18" height="13" rx="2" />
                    <path d="M8 21h8m-4-4v4" />
                  </>
                )}
              </svg>
            </span>
          </label>
        ))}
      </div>
      <label className="christmas-option">
        <input
          type="checkbox"
          checked={christmas}
          onChange={(e) => writePreference("cena-christmas", e.target.checked ? "on" : "off")}
        />
        <UiIcon name="tree" />
        Decoração de Natal
      </label>
      {duration === "memory" && (
        <small role="status">O navegador bloqueou o armazenamento. O tema vale até recarregar a página.</small>
      )}
    </fieldset>
  );
}
