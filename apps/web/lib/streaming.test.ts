import test from "node:test";
import assert from "node:assert/strict";
import { availabilityGroups, includedInSubscriptions, toggleProvider, type Availability } from "./streaming.ts";

const netflix = { id: 8, name: "Netflix", logo: null };
const prime = { id: 119, name: "Prime Video", logo: null };
const pluto = { id: 300, name: "Pluto TV", logo: null };
const store = { id: 2, name: "Apple TV", logo: null };
const availability: Availability = { link: null, stream: [netflix, prime], free: [pluto], rent: [store], buy: [] };

test("grupos vazios somem e a ordem é assinatura, grátis, aluguel, compra", () => {
  assert.deepEqual(
    availabilityGroups(availability, []).map((group) => [group.key, group.label]),
    [
      ["stream", "Assinatura"],
      ["free", "Grátis"],
      ["rent", "Aluguel"],
    ],
  );
  assert.deepEqual(availabilityGroups({ link: null, stream: [], free: [], rent: [], buy: [] }, [8]), []);
});

test("serviços assinados vêm primeiro e são marcados", () => {
  const [stream] = availabilityGroups(availability, [119]);
  assert.deepEqual(
    stream.providers.map((provider) => [provider.name, provider.subscribed]),
    [
      ["Prime Video", true],
      ["Netflix", false],
    ],
  );
});

test("aluguel e compra nunca contam como assinatura, mesmo com o mesmo id marcado", () => {
  const rent = availabilityGroups(availability, [2]).find((group) => group.key === "rent");
  assert.equal(rent?.providers[0].subscribed, false);
  assert.equal(includedInSubscriptions(availability, [2]), false);
});

test("obra incluída vale para assinatura e para serviço gratuito", () => {
  assert.equal(includedInSubscriptions(availability, [8]), true);
  assert.equal(includedInSubscriptions(availability, [300]), true);
  assert.equal(includedInSubscriptions(availability, []), false);
});

test("alternar serviço não altera a lista original e mantém a ordem", () => {
  const selected = [8, 300];
  assert.deepEqual(toggleProvider(selected, 119), [8, 119, 300]);
  assert.deepEqual(toggleProvider(selected, 8), [300]);
  assert.deepEqual(selected, [8, 300]);
});
