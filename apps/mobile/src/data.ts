import { Platform } from "react-native";

export const defaultSeries = "demo-mare-alta";
export type Title = {
  id: string;
  format: string;
  anime: boolean;
  name: string;
  year: string;
  summary: string;
};
export async function catalog(): Promise<Title[]> {
  return (await (await request("/api/v1/titles")).json()).items;
}
export async function detail(id: string): Promise<Title> {
  return (await request("/api/v1/titles/" + encodeURIComponent(id))).json();
}
export const origin = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
export const onlineAvailable = Boolean(
  origin &&
  /^https:\/\//.test(origin) &&
  (Platform.OS !== "web" ||
    (typeof location !== "undefined" && location.origin === origin)),
);
export type Item = { number: number; name: string; summary?: string };
async function request(path: string, options: RequestInit = {}) {
  if (!onlineAvailable) throw Error("Configure a conexão com o Cena Aberta.");
  const response = await fetch(origin + path, {
    credentials: "include",
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.message || "Não foi possível acessar a conta.");
  }
  return response;
}

export async function session() {
  return (await (await request("/api/auth/session")).json())?.actor;
}

async function authForm(path: string, fields: Record<string, string>) {
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  const body = new URLSearchParams({
    ...fields,
    csrfToken,
    json: "true",
    callbackUrl: origin!,
  });
  const result = await request("/api/auth/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return result.json();
}
export async function login(email: string, password: string) {
  const result = await authForm("callback/email-account", {
    email: email.trim(),
    password,
  });
  if (
    !result.url ||
    new URL(result.url).searchParams.has("error") ||
    !(await session())
  )
    throw Error("Confira o e-mail e a senha.");
}
export async function logout() {
  await authForm("signout", {});
}

export async function items(
  season?: number,
  series = defaultSeries,
): Promise<Item[]> {
  return (
    await request(
      "/api/v1/titles/" +
        encodeURIComponent(series) +
        "/seasons" +
        (season === undefined ? "" : "/" + season),
    )
  ).json();
}
function path(series: string, season: number) {
  return "/api/v1/me/episodes/" + encodeURIComponent(series) + "/" + season;
}
export async function rating(
  season: number,
  episode: number,
  series = defaultSeries,
): Promise<number | null> {
  const entries: { episode: number; rating: number }[] = await (
    await request(path(series, season))
  ).json();
  return entries.find((row) => row.episode === episode)?.rating ?? null;
}
export async function save(
  season: number,
  episode: number,
  value: number,
  series = defaultSeries,
) {
  await request(path(series, season) + "/" + episode, {
    method: "PUT",
    headers: { Origin: origin!, "Content-Type": "application/json" },
    body: JSON.stringify({ rating: value }),
  });
}

export async function register(email: string) {
  await request("/api/accounts/register", {
    method: "POST",
    headers: { Origin: origin!, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
}
