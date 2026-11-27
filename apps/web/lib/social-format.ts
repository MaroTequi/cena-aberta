// Textos do feed e da compatibilidade.

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Tempo relativo curto para o feed e os comentários.
 * @param iso instante ISO-8601 (UTC)
 * @param now referência (padrão: agora)
 * @returns `"agora"`, `"há 5 min"`, `"há 3 h"`, `"há 2 dias"` ou a data `dd/mm/aaaa` depois de 7 dias
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return "há " + minutes + " min";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return "há " + hours + " h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "há 1 dia" : "há " + days + " dias";
  return dateFormat.format(at);
}

/**
 * Frase do item do feed.
 * @param kind `watched`, `rated` ou `reviewed`
 * @returns o verbo da ação, ex.: `"assistiu"`
 */
export function feedAction(kind: string): string {
  if (kind === "watched") return "assistiu";
  if (kind === "rated") return "avaliou";
  if (kind === "reviewed") return "escreveu sobre";
  return "comentou";
}

/**
 * Resumo da compatibilidade de gosto.
 * @param agreement porcentagem de 0 a 100, ou `null` quando há menos de 3 obras em comum
 * @returns uma frase curta para acompanhar o número
 */
export function agreementLabel(agreement: number | null): string {
  if (agreement === null) return "Ainda há poucas obras avaliadas pelos dois.";
  if (agreement >= 85) return "Almas gêmeas do cinema.";
  if (agreement >= 70) return "Gostos bem parecidos.";
  if (agreement >= 50) return "Concordam em boa parte.";
  if (agreement >= 30) return "Opiniões divididas.";
  return "Gostos bem diferentes.";
}
