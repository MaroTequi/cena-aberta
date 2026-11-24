import test from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "./client-api.ts";

function stub(status: number, body: string) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body || null, { status });
  }) as typeof fetch;
  return calls;
}

test("envia JSON, chave de idempotência e devolve o corpo", async () => {
  const calls = stub(200, '{"id":"1"}');
  assert.deepEqual(await api("me/collections", "POST", { name: "A" }, "chave-123"), { id: "1" });
  assert.equal(calls[0].url, "/api/v1/me/collections");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], "chave-123");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, '{"name":"A"}');
});

test("erro traz a mensagem do backend e o status", async () => {
  stub(409, '{"status":409,"message":"Coleção alterada. Atualize a página."}');
  await assert.rejects(api("me/collections/x", "PUT", {}), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 409);
    assert.equal(e.message, "Coleção alterada. Atualize a página.");
    return true;
  });
});

test("erro sem JSON usa mensagem genérica; corpo vazio vira null", async () => {
  stub(502, "<html>");
  await assert.rejects(api("feed"), /Não foi possível concluir a ação/);
  stub(200, "");
  assert.equal(await api("feed"), null);
});
