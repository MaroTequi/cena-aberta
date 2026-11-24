import test from "node:test";
import assert from "node:assert/strict";
import { agreementLabel, feedAction, relativeTime } from "./social-format.ts";

test("tempo relativo do feed", () => {
  const now = new Date("2026-11-24T15:00:00Z");
  assert.equal(relativeTime("2026-11-24T14:59:40Z", now), "agora");
  assert.equal(relativeTime("2026-11-24T14:54:30.123456Z", now), "há 5 min");
  assert.equal(relativeTime("2026-11-24T12:00:00Z", now), "há 3 h");
  assert.equal(relativeTime("2026-11-23T14:00:00Z", now), "há 1 dia");
  assert.equal(relativeTime("2026-11-20T15:00:00Z", now), "há 4 dias");
  assert.equal(relativeTime("2026-11-01T15:00:00Z", now), "01/11/2026");
  assert.equal(relativeTime("não é data", now), "");
});

test("verbos do feed", () => {
  assert.equal(feedAction("watched"), "assistiu");
  assert.equal(feedAction("rated"), "avaliou");
  assert.equal(feedAction("reviewed"), "escreveu sobre");
});

test("frase da compatibilidade", () => {
  assert.match(agreementLabel(null), /poucas obras/);
  assert.equal(agreementLabel(90), "Almas gêmeas do cinema.");
  assert.equal(agreementLabel(0), "Gostos bem diferentes.");
});
