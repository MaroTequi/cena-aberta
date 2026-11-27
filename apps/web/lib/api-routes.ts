/** Serviço interno para onde o BFF repassa a chamada. */
export type Target = "catalog" | "social" | "backup";

/**
 * Tabela de rotas permitidas do BFF: método, padrão do caminho e serviço de destino.
 * A ordem é a mesma do proxy original; a primeira regra que casar vence.
 */
export const routes: ReadonlyArray<readonly [string, RegExp, Target]> = [
  ["PUT", /^notifications\/rooms\/[a-f0-9-]{36}\/read$/, "social"],
  ["GET", /^notifications$/, "social"],
  ["GET", /^library-page$/, "social"],
  ["GET", /^diary$/, "social"],
  ["POST", /^backups$/, "backup"],
  ["GET", /^backups(?:\/[a-f0-9]{48})?$/, "backup"],
  ["GET", /^feedback\/[a-f0-9-]{36}\/images\/[a-f0-9-]{36}$/, "social"],
  ["PUT", /^rooms\/[a-f0-9-]{36}\/reconsider\/[a-z0-9-]+$/, "social"],
  ["PUT", /^me\/visibility$/, "social"],
  ["DELETE", /^rooms\/[a-f0-9-]{36}$/, "social"],
  ["GET", /^friends(?:\/(?:search|status|profile|compatibility))?$/, "social"],
  ["POST", /^friends$/, "social"],
  ["PUT", /^friends\/[a-f0-9-]{36}$/, "social"],
  ["PUT", /^rooms\/[a-f0-9-]{36}\/settings$/, "social"],
  ["GET", /^feedback\/review-reports$/, "social"],
  ["PUT", /^feedback\/review-reports\/[a-f0-9-]{36}$/, "social"],
  ["POST", /^titles\/[a-z0-9-]+\/review-report$/, "social"],
  ["GET", /^feedback(?:\/access)?$/, "social"],
  ["POST", /^feedback$/, "social"],
  ["PUT", /^feedback\/[a-f0-9-]{36}(?:\/thanks)?$/, "social"],
  ["GET", /^profiles$/, "social"],
  ["GET", /^rooms(?:\/[a-f0-9-]{36}(?:\/friends)?)?$/, "social"],
  ["POST", /^rooms(?:\/[a-f0-9-]{36}\/(?:join|leave|invite|start|more|choose\/[a-z0-9-]+))?$/, "social"],
  ["PUT", /^rooms\/[a-f0-9-]{36}\/votes\/[a-z0-9-]+$/, "social"],
  ["GET", /^titles\/[a-z0-9-]+\/seasons(?:\/[0-9]+)?$/, "catalog"],
  ["GET", /^me\/season-progress\/[a-z0-9-]+\/[0-9]+$/, "social"],
  ["GET", /^me\/series-progress\/[a-z0-9-]+$/, "social"],
  ["GET", /^me\/episodes\/[a-z0-9-]+(?:\/[0-9]+)?$/, "social"],
  ["PUT", /^me\/episodes\/[a-z0-9-]+\/[0-9]+\/[0-9]+$/, "social"],
  ["GET", /^me\/ranking$/, "social"],
  ["PUT", /^me\/ranking(?:\/[a-z0-9-]+)?$/, "social"],
  ["GET", /^title-batch$/, "catalog"],
  ["GET", /^providers$/, "catalog"],
  ["GET", /^people$/, "catalog"],
  ["GET", /^titles\/(?:demo-[a-z0-9-]+|tmdb-(?:movie|tv)-[0-9]+)\/providers$/, "catalog"],
  ["GET", /^titles\/(?:demo-[a-z0-9-]+|tmdb-(?:movie|tv)-[0-9]+)\/trailer$/, "catalog"],
  ["GET", /^me\/providers$/, "social"],
  ["PUT", /^me\/providers$/, "social"],
  ["GET", /^titles(?:\/(?:demo-[a-z0-9-]+|tmdb-(?:movie|tv)-[0-9]+|(?:ep|season)-[a-z0-9-]+))?$/, "catalog"],
  ["PUT", /^titles\/[a-z0-9-]+\/(?:spoiler-vote|review-like)$/, "social"],
  ["GET", /^(?:me|profiles\/[a-z0-9_]+|titles\/[a-z0-9-]+\/(?:reviews|community|friends|review-comments))$/, "social"],
  ["POST", /^titles\/[a-z0-9-]+\/review-comments$/, "social"],
  ["DELETE", /^titles\/[a-z0-9-]+\/review-comments\/[a-f0-9-]{36}$/, "social"],
  [
    "PUT",
    /^me\/(?:profile|library\/[a-z0-9-]+\/(?:watched|interest|rating|review|rewatching|visibility)|viewings\/[a-f0-9-]{36})$/,
    "social",
  ],
  ["POST", /^me\/viewings$/, "social"],
  ["DELETE", /^me\/viewings\/[a-f0-9-]{36}$/, "social"],
  ["GET", /^me\/collections(?:\/[a-f0-9-]{36})?$/, "social"],
  ["POST", /^me\/collections$/, "social"],
  ["PUT", /^me\/collections\/[a-f0-9-]{36}(?:\/items)?$/, "social"],
  ["DELETE", /^me\/collections\/[a-f0-9-]{36}$/, "social"],
  ["GET", /^collections(?:\/[a-f0-9-]{36})?$/, "social"],
  ["GET", /^me\/(?:stats|goal|export)$/, "social"],
  ["PUT", /^me\/goal$/, "social"],
  ["GET", /^feed$/, "social"],
  ["GET", /^recommendations$/, "social"],
  ["POST", /^recommendations$/, "social"],
  ["PUT", /^recommendations\/[a-f0-9-]{36}\/read$/, "social"],
];

/**
 * Descobre para qual serviço uma chamada deve ser repassada.
 * @param method método HTTP da requisição
 * @param path caminho após /api/v1, sem barra inicial
 * @returns o serviço de destino, ou null quando a rota não é permitida
 */
export function resolveRoute(method: string, path: string): Target | null {
  const route = routes.find(([routeMethod, pattern]) => routeMethod === method && pattern.test(path));
  return route ? route[2] : null;
}

/** Rotas do social que consultam o catálogo em lote e por isso precisam do mesmo prazo de `title-batch`. */
const BATCH_PATHS = new Set(["title-batch", "me/stats", "library-page", "providers"]);

/**
 * Prazo (ms) para o serviço interno responder.
 * @param path caminho após /api/v1, sem barra inicial
 * @param download true para downloads (backup e exportação), que levam mais tempo para gerar o arquivo
 * @returns o prazo em milissegundos
 */
export function upstreamTimeout(path: string, download: boolean): number {
  if (path.startsWith("rooms/") && (path.endsWith("/start") || path.endsWith("/more"))) return 65000;
  if (BATCH_PATHS.has(path)) return 25000;
  if (/^me\/(?:season|series)-progress\//.test(path)) return 15000;
  return download ? 30000 : 6500;
}
