import "server-only";
export type Release = { id: string; name: string; poster: string | null; year: string };
export async function recentReleases(): Promise<Release[]> {
  const secret = process.env.CATALOG_INTERNAL_SECRET;
  if (!secret) return [];
  try {
    const r = await fetch((process.env.CATALOG_URL ?? "http://127.0.0.1:8181") + "/releases", {
      headers: { "X-Internal-Key": secret },
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(4500),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data)
      ? data.slice(0, 6).map(({ id, name, poster, year }) => ({ id, name, poster, year }))
      : [];
  } catch {
    return [];
  }
}
