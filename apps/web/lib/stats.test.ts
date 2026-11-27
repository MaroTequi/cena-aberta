import test from "node:test";
import assert from "node:assert/strict";
import { barPercent, expectedByNow, formatMinutes, goalProgress, ratingBuckets, toStars } from "./stats.ts";

test("nota 1–10 vira meia a cinco estrelas", () => {
  assert.equal(toStars(1), "0,5");
  assert.equal(toStars(9), "4,5");
  assert.equal(toStars(10), "5");
  assert.equal(toStars(7.85), "3,9");
});

test("minutos viram horas legíveis", () => {
  assert.equal(formatMinutes(0), "0 min");
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(formatMinutes(3125), "52 h 5 min");
  assert.equal(formatMinutes(-3), "0 min");
});

test("barras proporcionais sem dividir por zero", () => {
  assert.equal(barPercent(5, 10), 50);
  assert.equal(barPercent(3, 0), 0);
  assert.equal(barPercent(0, 7), 0);
  assert.equal(barPercent(20, 10), 100);
});

test("progresso da meta", () => {
  assert.equal(goalProgress(10, null), null);
  assert.deepEqual(goalProgress(37, 50), { percent: 74, remaining: 13, reached: false });
  assert.deepEqual(goalProgress(60, 50), { percent: 100, remaining: 0, reached: true });
  assert.deepEqual(goalProgress(0, 1), { percent: 0, remaining: 1, reached: false });
});

test("ritmo esperado da meta", () => {
  const now = new Date(2026, 6, 2); // 2 de julho: dia 183 de 365
  assert.equal(expectedByNow(365, 2026, now), 183);
  assert.equal(expectedByNow(50, 2025, now), 50);
  assert.equal(expectedByNow(50, 2027, now), 0);
});

test("histograma agrupado em estrelas", () => {
  const buckets = ratingBuckets([0, 1, 0, 2, 3, 4, 6, 8, 5, 3]);
  assert.equal(buckets.length, 10);
  assert.deepEqual(buckets[0], { label: "0,5★", count: 0 });
  assert.deepEqual(buckets[9], { label: "5★", count: 3 });
  assert.equal(
    ratingBuckets([]).every((b) => b.count === 0),
    true,
  );
});
