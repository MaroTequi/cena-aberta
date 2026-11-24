/** Erro de uma chamada à API, com o status HTTP para a tela decidir o que mostrar (409, 403, 429…). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Chama uma rota do BFF (`/api/v1/<path>`) e devolve o JSON.
 * @param path rota sem o prefixo, ex.: `me/collections`
 * @param method método HTTP
 * @param body corpo enviado como JSON (omitido quando `undefined`)
 * @param key `Idempotency-Key` opcional, usado nas criações
 * @returns o corpo JSON da resposta (ou `null` quando vazio)
 * @throws ApiError com a `message` do backend e o status
 */
export async function api<T>(path: string, method = "GET", body?: unknown, key?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch("/api/v1/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  let json: { message?: string } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) throw new ApiError(json?.message || "Não foi possível concluir a ação.", response.status);
  return json as T;
}
