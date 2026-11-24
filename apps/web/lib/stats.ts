// Formatação das estatísticas e da meta anual. Notas do backend vão de 1 a 10; na tela, 1 = meia estrela.

/** Abreviações dos meses, janeiro no índice 0 (mesma ordem de `byMonth`). */
export const monthLabels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Converte a nota 1–10 em estrelas, no formato brasileiro.
 * @param rating nota na escala do backend
 * @returns texto como `"4,5"` (até uma casa decimal)
 */
export function toStars(rating: number): string {
  return (rating / 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Formata minutos como duração legível.
 * @param minutes total de minutos (negativos contam como 0)
 * @returns `"45 min"`, `"2 h"` ou `"52 h 5 min"`
 */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60),
    rest = total % 60;
  if (!hours) return rest + " min";
  return hours.toLocaleString("pt-BR") + " h" + (rest ? " " + rest + " min" : "");
}

/**
 * Largura proporcional de uma barra.
 * @returns porcentagem de 0 a 100 do valor em relação ao máximo (0 quando o máximo é 0)
 */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

/**
 * Progresso da meta anual.
 * @param done obras distintas vistas no ano
 * @param target meta (ou `null` sem meta)
 * @returns `null` sem meta; senão a porcentagem (limitada a 100), quanto falta e se a meta foi batida
 */
export function goalProgress(
  done: number,
  target: number | null,
): { percent: number; remaining: number; reached: boolean } | null {
  if (!target || target < 1) return null;
  return {
    percent: Math.min(100, Math.floor((done / target) * 100)),
    remaining: Math.max(0, target - done),
    reached: done >= target,
  };
}

/**
 * Quantas obras a pessoa "deveria" ter visto até hoje para bater a meta num ritmo constante.
 * @param target meta do ano
 * @param year ano da meta
 * @param now data de referência (o dia conta como já iniciado)
 * @returns o esperado até `now`: a meta inteira em ano passado, 0 em ano futuro
 */
export function expectedByNow(target: number, year: number, now: Date): number {
  if (year < now.getFullYear()) return target;
  if (year > now.getFullYear()) return 0;
  const start = new Date(year, 0, 1).getTime(),
    end = new Date(year + 1, 0, 1).getTime();
  const elapsed = Math.floor((now.getTime() - start) / 86400000) + 1;
  const days = Math.round((end - start) / 86400000);
  return Math.round((target * elapsed) / days);
}

/**
 * Histograma de notas (10 posições, índice i = nota i+1) agrupado para exibir em estrelas.
 * @returns uma linha por meia estrela, com o rótulo e a contagem
 */
export function ratingBuckets(histogram: number[]): { label: string; count: number }[] {
  return Array.from({ length: 10 }, (_, i) => ({ label: toStars(i + 1) + "★", count: histogram[i] ?? 0 }));
}
