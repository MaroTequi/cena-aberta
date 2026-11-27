import { createHash } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import { encode, type JWTEncodeParams } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Keycloak from "next-auth/providers/keycloak";
import { accountRequest } from "./accounts";
import { googleEnabled, googleSignIn, type GoogleAccount } from "./google-login";

const issuer = process.env.OIDC_ISSUER;
const sessionAge = 8 * 60 * 60;
const rememberedSessionAge = 30 * 24 * 60 * 60;
export const emailAccounts = !issuer && process.env.EMAIL_ACCOUNTS === "true";
/** Login com o Google: liga quando há contas por e-mail e as credenciais GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. */
export const googleLogin = googleEnabled(process.env);
function invited(subject: string) {
  return (process.env.INVITED_SUBJECTS ?? "")
    .split(",")
    .map((item) => item.trim())
    .includes(subject);
}

export function encodeSession(params: JWTEncodeParams) {
  const deadline = params.token?.loginExpiresAt;
  return encode(
    typeof deadline === "number" ? { ...params, maxAge: deadline - Math.floor(Date.now() / 1000) } : params,
  );
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: sessionAge },
  jwt: { encode: encodeSession },
  providers: issuer
    ? [
        Keycloak({
          issuer,
          clientId: process.env.OIDC_CLIENT_ID!,
          clientSecret: process.env.OIDC_CLIENT_SECRET!,
          checks: ["pkce", "state"],
        }),
      ]
    : emailAccounts
      ? [
          Credentials({
            id: "email-account",
            name: "Conta por e-mail",
            credentials: { email: {}, password: {}, token: {}, purpose: {}, rememberMe: {} },
            async authorize(input) {
              if (!input) return null;
              const { email, password, token, purpose } = input;
              const endpoint = purpose === "register" || purpose === "reset" ? purpose + "/confirm" : "login";
              const response = await accountRequest(endpoint, {
                method: "POST",
                body: JSON.stringify({ email, password, token }),
              });
              if (!response.ok) {
                if (response.status === 401) return null;
                const error = await response.json().catch(() => null);
                throw new Error(
                  response.status < 500 && error?.message ? error.message : "Serviço de contas indisponível.",
                );
              }
              const user = (await response.json()) as { id: string; email: string; version: number };
              return { ...user, rememberMe: endpoint === "login" && input.rememberMe === "true" };
            },
          }),
          ...(googleLogin
            ? [
                Google({
                  clientId: process.env.GOOGLE_CLIENT_ID!,
                  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                  checks: ["pkce", "state"],
                  authorization: { params: { prompt: "select_account" } },
                }),
              ]
            : []),
        ]
      : [],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "email-account") return emailAccounts;
      if (account?.provider === "google") {
        if (!googleLogin) return false;
        const result = await googleSignIn(
          profile as { email?: unknown; email_verified?: unknown } | undefined,
          account.providerAccountId,
          (body) =>
            accountRequest("google", { method: "POST", body }).then(
              (response) => {
                // Só o status vai para o log: nada de e-mail, identificador ou token.
                if (!response.ok) console.warn("Login com o Google: serviço de contas respondeu " + response.status);
                return response;
              },
              (failure: Error) => {
                console.warn("Login com o Google: serviço de contas inacessível (" + failure.name + ")");
                throw failure;
              },
            ),
        );
        if (typeof result === "string") return result;
        // O mesmo objeto chega ao callback jwt logo depois; é assim que a conta segue para a sessão.
        (user as { cenaAccount?: GoogleAccount }).cenaAccount = result;
        return true;
      }
      return Boolean(
        issuer &&
        account?.provider === "keycloak" &&
        invited(account.providerAccountId) &&
        (profile as { email_verified?: boolean } | undefined)?.email_verified === true,
      );
    },
    async jwt({ token, account, user }) {
      if (account?.provider === "keycloak") {
        token.actor = createHash("sha256")
          .update(issuer + "\u0000" + account.providerAccountId)
          .digest("hex");
        token.subject = account.providerAccountId;
      } else if (account?.provider === "google") {
        const login = (user as { cenaAccount?: GoogleAccount }).cenaAccount;
        if (login) {
          token.actor = login.id;
          token.accountVersion = login.version;
          token.rememberMe = false;
          token.loginExpiresAt = Math.floor(Date.now() / 1000) + sessionAge;
        }
      } else if (account?.provider === "email-account") {
        const accountUser = user as { version?: number; rememberMe?: boolean };
        token.actor = user.id;
        token.accountVersion = accountUser.version;
        token.rememberMe = accountUser.rememberMe === true;
        token.loginExpiresAt = Math.floor(Date.now() / 1000) + (token.rememberMe ? rememberedSessionAge : sessionAge);
      }
      if (typeof token.subject === "string" && !invited(token.subject)) delete token.actor;
      if (typeof token.actor === "string" && token.actor.startsWith("demo_")) delete token.actor;
      return token;
    },
    async session({ session, token }) {
      if (typeof token.loginExpiresAt === "number") {
        session.expires = new Date(token.loginExpiresAt * 1000).toISOString();
        if (Date.now() >= token.loginExpiresAt * 1000) return { ...session, actor: null };
      }
      let actor = typeof token.actor === "string" ? token.actor : null;
      if (actor?.startsWith("account_")) {
        const valid =
          emailAccounts &&
          typeof token.accountVersion === "number" &&
          (await accountRequest("session?version=" + token.accountVersion, { headers: { "X-Actor": actor } }).then(
            (r) => r.ok,
            () => false,
          ));
        if (!valid) actor = null;
      }
      return { ...session, actor };
    },
  },
  pages: { signIn: "/" },
};
