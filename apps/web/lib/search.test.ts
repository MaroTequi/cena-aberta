import test from "node:test";
import assert from "node:assert/strict";
import { cleanTerm, departmentLabel, parseTab, searchHref, titleTypeOf } from "./search.ts";

test("parseTab should accept known tabs and fall back to tudo", () => {
  assert.equal(parseTab("pessoas"), "pessoas");
  assert.equal(parseTab("animes"), "animes");
  assert.equal(parseTab("qualquer"), "tudo");
  assert.equal(parseTab(undefined), "tudo");
  assert.equal(parseTab(null), "tudo");
});

test("searchHref should keep only what is needed in the address", () => {
  assert.equal(searchHref("", "tudo"), "/busca");
  assert.equal(searchHref("  matrix ", "tudo"), "/busca?q=matrix");
  assert.equal(searchHref("cidade de deus", "filmes"), "/busca?q=cidade+de+deus&tipo=filmes");
  assert.equal(searchHref("", "pessoas"), "/busca?tipo=pessoas");
  assert.equal(searchHref("a&b=c", "series"), "/busca?q=a%26b%3Dc&tipo=series");
});

test("titleTypeOf should map each tab to the catalog type", () => {
  assert.deepEqual(titleTypeOf, { tudo: "all", filmes: "movie", series: "tv", animes: "anime", pessoas: null });
});

test("departmentLabel should translate known areas and keep unknown ones", () => {
  assert.equal(departmentLabel("Acting"), "Atuação");
  assert.equal(departmentLabel("Directing"), "Direção");
  assert.equal(departmentLabel("Costume & Make-Up"), "Figurino e maquiagem");
  assert.equal(departmentLabel("Gaffer"), "Gaffer");
  assert.equal(departmentLabel(""), "");
});

test("cleanTerm should trim and collapse repeated spaces", () => {
  assert.equal(cleanTerm("   cidade    de \t deus  "), "cidade de deus");
  assert.equal(cleanTerm("   "), "");
  assert.equal(searchHref("  naruto   shippuden ", "tudo"), "/busca?q=naruto+shippuden");
});
