import test from "node:test";
import assert from "node:assert/strict";
import { resolveRoute, routes } from "./api-routes.ts";

test("resolve o serviço de destino das rotas conhecidas", () => {
  assert.equal(resolveRoute("GET", "titles/tmdb-movie-603"), "catalog");
  assert.equal(resolveRoute("GET", "titles/tmdb-movie-603/seasons/1"), "catalog");
  assert.equal(resolveRoute("PUT", "me/ranking"), "social");
  assert.equal(resolveRoute("GET", "diary"), "social");
  assert.equal(resolveRoute("GET", "notifications"), "social");
  assert.equal(resolveRoute("PUT", "titles/tmdb-movie-603/spoiler-vote"), "social");
  assert.equal(resolveRoute("POST", "backups"), "backup");
  assert.equal(resolveRoute("GET", "backups/" + "a".repeat(48)), "backup");
});

test("bloqueia o que não está na lista", () => {
  assert.equal(resolveRoute("DELETE", "me/ranking"), null); // método errado
  assert.equal(resolveRoute("GET", "suggestions"), null); // rota interna do catálogo
  assert.equal(resolveRoute("GET", "titles/../admin"), null); // travessia
  assert.equal(resolveRoute("POST", "me/lists"), null); // listas removidas no alpha
  assert.equal(resolveRoute("GET", "backups/curto"), null);
});

test("toda regra usa um método HTTP que o proxy exporta", () => {
  for (const [method] of routes) assert.ok(["GET", "PUT", "POST", "DELETE"].includes(method), method);
});

test("encaminha temporadas, episódios, progresso e denúncias apenas pelos métodos previstos", () => {
  const cases = [
    ["GET", "titles/demo-mare-alta/seasons", "catalog"],
    ["GET", "titles/season-demo-mare-alta-s1", "catalog"],
    ["GET", "titles/ep-demo-mare-alta-s1-e1", "catalog"],
    ["GET", "me/season-progress/demo-mare-alta/1", "social"],
    ["GET", "me/series-progress/demo-mare-alta", "social"],
    ["POST", "titles/demo-mare-alta/review-report", "social"],
    ["GET", "feedback/review-reports", "social"],
    ["PUT", "feedback/review-reports/23e45678-e89b-12d3-a456-426614174000", "social"],
  ] as const;
  for (const [allowed, path, target] of cases) {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      assert.equal(resolveRoute(method, path), method === allowed ? target : null, method + " " + path);
    }
  }
});
