import test from "node:test";
import assert from "node:assert/strict";
import { addTitle, moveTitle, removeTitle } from "./collection-items.ts";

test("reordena obras da coleção", () => {
  assert.deepEqual(moveTitle(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveTitle(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveTitle(["a", "b"], 0, -1), ["a", "b"]);
  assert.deepEqual(moveTitle(["a", "b"], 1, 1), ["a", "b"]);
  assert.deepEqual(moveTitle([], 0, 1), []);
});

test("adiciona sem repetir e remove", () => {
  assert.deepEqual(addTitle(["a"], "b"), ["a", "b"]);
  assert.deepEqual(addTitle(["a", "b"], "a"), ["a", "b"]);
  assert.deepEqual(removeTitle(["a", "b"], "a"), ["b"]);
  assert.deepEqual(removeTitle(["a"], "x"), ["a"]);
});
