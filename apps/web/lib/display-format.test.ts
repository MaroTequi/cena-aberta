import test from "node:test";
import assert from "node:assert/strict";
import { displayRating, sessionDate, sessionTime } from "./display-format.ts";

test("nota interna de 1 a 10 aparece em estrelas com vírgula decimal", () => {
  assert.equal(displayRating(10), "5");
  assert.equal(displayRating(9), "4,5");
  assert.equal(displayRating(1), "0,5");
});

test("data e hora da sessão usam o fuso de São Paulo, não o do servidor", () => {
  const instant = new Date("2026-01-01T01:30:00Z");
  assert.equal(sessionDate.format(instant), "31/12/2025");
  assert.equal(sessionTime.format(instant), "22:30");
});
