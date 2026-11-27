/** Nota interna (1 a 10) exibida em estrelas (0,5 a 5), no formato pt-BR. */
export const displayRating = (rating: number) => (rating / 2).toLocaleString("pt-BR");
export const sessionDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const sessionTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
