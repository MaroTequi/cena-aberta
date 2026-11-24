import test from "node:test";
import assert from "node:assert/strict";
import { filterOptions, libraryParams, sortOptions } from "./library-query.ts";

test("sem ordenação nem filtro, a consulta é a antiga", () => {
  assert.equal(libraryParams({ section: "watched", page: 2 }).toString(), "section=watched&page=2");
  assert.equal(
    libraryParams({ section: "watched", page: 1, sort: "title", filter: "all" }).toString(),
    "section=watched&page=1",
  );
});

test("envia username, sort e filter escolhidos", () => {
  const params = libraryParams({ section: "watched", page: 1, username: "Bia Silva", sort: "rating", filter: "min:8" });
  assert.equal(params.get("username"), "Bia Silva");
  assert.equal(params.get("sort"), "rating");
  assert.equal(params.get("filter"), "min:8");
  assert.match(params.toString(), /username=Bia\+Silva/);
});

test("recent não vale para o Vou ver nem para visitante sem diário público", () => {
  assert.equal(libraryParams({ section: "watchlist", page: 1, sort: "recent" }).has("sort"), false);
  assert.equal(libraryParams({ section: "watched", page: 1, sort: "recent", diaryVisible: false }).has("sort"), false);
  assert.equal(
    libraryParams({ section: "watched", page: 1, sort: "recent", diaryVisible: true }).get("sort"),
    "recent",
  );
  assert.ok(!sortOptions("watchlist", true).some((o) => o.value === "recent"));
  assert.ok(!sortOptions("watched", false).some((o) => o.value === "recent"));
});

test("filtros de nota ficam só nos Já vistos; valores desconhecidos são ignorados", () => {
  assert.ok(filterOptions("watched").some((o) => o.value === "unrated"));
  assert.ok(!filterOptions("watchlist").some((o) => o.value === "rated"));
  assert.equal(libraryParams({ section: "watchlist", page: 1, filter: "rated" }).has("filter"), false);
  assert.equal(libraryParams({ section: "watchlist", page: 1, filter: "anime" }).get("filter"), "anime");
  assert.equal(
    libraryParams({ section: "watched", page: 1, sort: "bogus", filter: "min:99" }).toString(),
    "section=watched&page=1",
  );
});
