import test from "node:test";
import assert from "node:assert/strict";
import { googleEnabled, googleErrors, googleSignIn } from "./google-login.ts";

const verified = { email: "ana@example.test", email_verified: true };
const answer =
  (status: number, body: unknown = {}) =>
  async () =>
    Response.json(body, { status });

test("googleEnabled should need email accounts and both Google credentials", () => {
  const base = { EMAIL_ACCOUNTS: "true", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
  assert.equal(googleEnabled(base), true);
  assert.equal(googleEnabled({ ...base, GOOGLE_CLIENT_SECRET: " " }), false);
  assert.equal(googleEnabled({ ...base, EMAIL_ACCOUNTS: "false" }), false);
  assert.equal(googleEnabled({ ...base, OIDC_ISSUER: "https://sso.example.test" }), false);
});

test("googleSignIn should refuse unverified emails before calling the account service", async () => {
  let called = false;
  const request = async () => {
    called = true;
    return Response.json({});
  };
  assert.equal(
    await googleSignIn({ email: "ana@example.test", email_verified: false }, "sub", request),
    "/conta?erro=google-email",
  );
  assert.equal(await googleSignIn({ email_verified: true }, "sub", request), "/conta?erro=google-email");
  assert.equal(await googleSignIn(verified, "", request), "/conta?erro=google-email");
  assert.equal(called, false);
});

test("googleSignIn should send the Google identity and return the account", async () => {
  let sent = "";
  const account = await googleSignIn(verified, "google-sub", async (body) => {
    sent = body;
    return Response.json({ id: "account_1", version: 0, email: "ana@example.test" });
  });
  assert.deepEqual(JSON.parse(sent), { subject: "google-sub", email: "ana@example.test", emailVerified: true });
  assert.deepEqual(account, { id: "account_1", version: 0, email: "ana@example.test" });
});

test("googleSignIn should turn each refusal into a login page message", async () => {
  assert.equal(await googleSignIn(verified, "s", answer(403)), "/conta?erro=google-convite");
  assert.equal(await googleSignIn(verified, "s", answer(409)), "/conta?erro=google-conflito");
  assert.equal(await googleSignIn(verified, "s", answer(503)), "/conta?erro=google-indisponivel");
  assert.equal(await googleSignIn(verified, "s", answer(200, { id: 1 })), "/conta?erro=google-indisponivel");
  const offline = async () => {
    throw new Error("offline");
  };
  assert.equal(await googleSignIn(verified, "s", offline), "/conta?erro=google-indisponivel");
  for (const code of ["google-email", "google-convite", "google-conflito", "google-indisponivel"])
    assert.ok(googleErrors[code], code);
});
