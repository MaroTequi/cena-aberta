import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { profileState } from "../../../../../lib/profile";
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) return Response.json({ message: "Entre para continuar." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL ?? request.url).origin)
    return Response.json({ message: "Origem inválida." }, { status: 403 });
  const { action } = await params;
  if (!["preview", "commit"].includes(action)) return new Response(null, { status: 404 });
  try {
    if ((await profileState(session.actor)).needsProfile)
      return Response.json({ message: "Conclua seu perfil." }, { status: 403 });
    const limit = action === "preview" ? 11_000_000 : 300_000;
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return Response.json({ message: "Arquivo ou lote muito grande." }, { status: 413 });
      }
      chunks.push(value);
    }
    const secret = process.env.SOCIAL_INTERNAL_SECRET;
    if (!secret) throw new Error();
    const response = await fetch(
      (process.env.SOCIAL_URL ?? "http://127.0.0.1:8182") + "/imports/letterboxd/" + action,
      {
        method: "POST",
        headers: {
          "X-Actor": session.actor,
          "X-Internal-Key": secret,
          "Content-Type": request.headers.get("Content-Type") ?? "application/json",
        },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(40000),
      },
    );
    const data = await response.json().catch(() => ({ message: "Não foi possível processar o arquivo." }));
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json(
      { message: "Importação indisponível. Tente novamente; lotes já salvos não serão duplicados." },
      { status: 503 },
    );
  }
}
