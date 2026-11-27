export function accountRequest(path: string, init: RequestInit = {}) {
  const secret = process.env.SOCIAL_INTERNAL_SECRET;
  if (!secret) throw new Error("Serviço de contas indisponível.");
  const headers = new Headers(init.headers);
  headers.set("X-Internal-Key", secret);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch((process.env.SOCIAL_URL ?? "http://127.0.0.1:8182") + "/accounts/" + path, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
}
