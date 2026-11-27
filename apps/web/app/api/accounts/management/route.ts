import { getServerSession } from "next-auth";
import { authOptions, emailAccounts } from "../../../../lib/auth";
import { accountRequest } from "../../../../lib/accounts";
async function handle(request: Request) {
  if (!emailAccounts)
    return Response.json({ message: "Gerencie esta conta pelo provedor de acesso." }, { status: 400 });
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) return Response.json({ message: "Entre para continuar." }, { status: 401 });
  if (
    request.method === "POST" &&
    request.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL ?? request.url).origin
  )
    return Response.json({ message: "Origem inválida." }, { status: 403 });
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body && body.length > 1024) return Response.json({ message: "Solicitação inválida." }, { status: 413 });
  try {
    const result = await accountRequest("management", {
      method: request.method,
      headers: { "X-Actor": session.actor },
      body,
    });
    return new Response(result.body, {
      status: result.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ message: "Serviço indisponível. Tente novamente." }, { status: 503 });
  }
}
export { handle as GET, handle as POST };
