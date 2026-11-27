/** Conta do Cena Aberta devolvida pelo serviço social depois de um login com o Google. */
export type GoogleAccount = { id: string; version: number; email: string };

/** Mensagens da tela de login para cada motivo de recusa (vêm em /conta?erro=...). */
export const googleErrors: Record<string, string> = {
  "google-email": "Confirme o e-mail na sua conta Google e tente de novo.",
  "google-convite": "O cadastro está aberto só para convidados. Peça um convite ou entre com uma conta que já existe.",
  "google-conflito": "Esta conta já está ligada a outro login do Google.",
  "google-indisponivel": "O login com o Google está indisponível agora. Tente de novo em instantes.",
};

/** Se o login com o Google está ligado: precisa das contas por e-mail e das credenciais do Google. */
export function googleEnabled(env: Record<string, string | undefined>) {
  return (
    !env.OIDC_ISSUER &&
    env.EMAIL_ACCOUNTS === "true" &&
    !!env.GOOGLE_CLIENT_ID?.trim() &&
    !!env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

/**
 * Decide o login com o Google a partir do perfil que o Google devolveu e da resposta do serviço de contas.
 * @param profile perfil do Google (precisa de e-mail verificado)
 * @param subject identificador fixo da pessoa no Google
 * @param request chama o serviço de contas (POST /accounts/google)
 * @returns a conta para seguir com o login, ou o endereço da tela de login com o motivo da recusa
 */
export async function googleSignIn(
  profile: { email?: unknown; email_verified?: unknown } | undefined,
  subject: string,
  request: (body: string) => Promise<Response>,
): Promise<GoogleAccount | string> {
  if (profile?.email_verified !== true || typeof profile.email !== "string" || !subject)
    return "/conta?erro=google-email";
  let response: Response;
  try {
    response = await request(JSON.stringify({ subject, email: profile.email, emailVerified: true }));
  } catch {
    return "/conta?erro=google-indisponivel";
  }
  if (response.status === 403) return "/conta?erro=google-convite";
  if (response.status === 409) return "/conta?erro=google-conflito";
  if (!response.ok) return "/conta?erro=google-indisponivel";
  const account = (await response.json().catch(() => null)) as GoogleAccount | null;
  if (!account || typeof account.id !== "string" || typeof account.version !== "number")
    return "/conta?erro=google-indisponivel";
  return account;
}
