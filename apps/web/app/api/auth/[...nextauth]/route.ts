import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions, encodeSession } from "../../../../lib/auth";

async function handler(request: NextRequest, context: RouteContext<"/api/auth/[...nextauth]">) {
  let cookiePolicy: { expiresAt: number; remember: boolean } | undefined;
  const response: Response = await NextAuth({
    ...authOptions,
    jwt: {
      ...authOptions.jwt,
      async encode(params) {
        if (typeof params.token?.loginExpiresAt === "number") {
          cookiePolicy = { expiresAt: params.token.loginExpiresAt, remember: params.token.rememberMe === true };
        }
        return encodeSession(params);
      },
    },
  })(request, context);
  if (!cookiePolicy) return response;

  // NextAuth sets the same cookie lifetime on sign-in and session refresh.
  // Use the policy from the JWT it issued, preserving other cookies and sign-out deletions.
  const { expiresAt, remember } = cookiePolicy;
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  for (const cookie of response.headers.getSetCookie()) {
    if (!/^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?=[^;]+;/.test(cookie)) {
      headers.append("Set-Cookie", cookie);
      continue;
    }
    const sessionCookie = cookie.replace(/;\s*(?:Expires|Max-Age)=[^;]*/gi, "");
    headers.append(
      "Set-Cookie",
      remember ? sessionCookie + "; Expires=" + new Date(expiresAt * 1000).toUTCString() : sessionCookie,
    );
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export { handler as GET, handler as POST };
