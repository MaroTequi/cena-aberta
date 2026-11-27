// Confere o contrato entre o BFF (apps/web/lib/api-routes.ts) e os serviços internos.
// Uso: node scripts/check-routes.mjs
//
// Falha (exit 1) quando:
//   1. um endpoint Spring não passa pelo BFF e também não foi declarado como interno;
//   2. o BFF repassa um endpoint para o serviço errado (ex.: rota do social mandada ao catálogo);
//   3. um endpoint declarado como interno fica acessível pelo proxy com o método HTTP dele;
//   4. uma regra do BFF não corresponde a nenhum endpoint do serviço de destino;
//   5. o serviço de backup não tem mais algum endpoint listado em BACKUP_ENDPOINTS.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { resolveRoute, routes } = await import(pathToFileURL(join(root, "apps/web/lib/api-routes.ts")).href);

// Endpoints que de propósito NÃO passam pelo BFF.
// Chave: "serviço MÉTODO /caminho", com o caminho exatamente como no Spring.
const INTERNAL_ONLY = new Map([
  ["catalog GET /health", "healthcheck do compose.alpha.yaml e scripts/smoke.mjs; sem chave interna"],
  ["social GET /health", "healthcheck do compose.alpha.yaml e scripts/smoke.mjs; sem chave interna"],
  ["catalog GET /chronology/{id}", "apps/web/lib/chronology.ts"],
  ["catalog GET /people/{id:[1-9][0-9]*}", "apps/web/app/pessoa/[id]/page.tsx"],
  ["catalog POST /review-releases", "apps/web/app/monthly-reviews.tsx"],
  ["social GET /public-review-titles", "apps/web/app/monthly-reviews.tsx"],
  ["social POST /public-release-reviews", "apps/web/app/monthly-reviews.tsx"],
  ["catalog GET /releases", "apps/web/lib/releases.ts (server component da home, direto no catálogo)"],
  ["catalog POST /suggestions", "social MovieRooms.java (sugestões da sala, direto no catálogo)"],
  ["social POST /accounts/{purpose:register|reset}", "apps/web/app/api/accounts/[purpose]/route.ts via lib/accounts.ts"],
  ["social POST /accounts/{purpose:register|reset}/confirm", "apps/web/lib/auth.ts (authorize do NextAuth) via lib/accounts.ts"],
  ["social POST /accounts/login", "apps/web/lib/auth.ts (authorize do NextAuth) via lib/accounts.ts"],
  ["social GET /accounts/session", "apps/web/lib/auth.ts (callback session do NextAuth) via lib/accounts.ts"],
  ["social GET /accounts/management", "apps/web/app/api/accounts/management/route.ts via lib/accounts.ts"],
  ["social POST /accounts/management", "apps/web/app/api/accounts/management/route.ts via lib/accounts.ts"],
  ["social POST /imports/letterboxd/preview", "apps/web/app/api/importar/letterboxd/[action]/route.ts (direto no social)"],
  ["social POST /imports/letterboxd/commit", "apps/web/app/api/importar/letterboxd/[action]/route.ts (direto no social)"],
]);

// Endpoints sem chamador encontrado: não são internos confirmados nem liberados no BFF.
// O script apenas avisa; a decisão (remover a rota ou expô-la) é de quem mantém o projeto.
const PENDING_REVIEW = new Map([
  // Vazio: todos os endpoints fora do BFF tiveram chamador encontrado.
  // Exemplo de entrada: ["social MÉTODO /caminho", "confirmar se esta rota ainda é usada"],
]);

// O backup é um serviço Python (deploy/backup_service.py), então o script não lê anotações dele.
// Cada endpoint traz um trecho que precisa existir no código-fonte, para a lista não envelhecer calada.
const BACKUP_SOURCE = "deploy/backup_service.py";
const BACKUP_ENDPOINTS = [
  { method: "GET", path: "/backups", source: 'self.path == "/backups"' },
  { method: "POST", path: "/backups", source: 'self.command == "POST"' },
  { method: "GET", path: "/backups/{id}", source: 'r"/backups/([a-f0-9]{48})"', samples: ["a".repeat(48)] },
];

// Amostras usadas no lugar de {variáveis} para testar se o BFF reconhece a rota.
const SAMPLES = ["00000000-0000-0000-0000-000000000000", "tmdb-movie-1", "1", "abc",
  "watched", "interest", "rating", "review", "rewatching", "visibility"];

function javaFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith(".") ? [] : javaFiles(full);
    return entry.name.endsWith(".java") ? [full] : [];
  });
}

/**
 * Extrai os endpoints (método + caminho Spring completo) de um arquivo de controller.
 * Só aceita mapeamento sem argumento ou com UM literal simples ("/x"). Qualquer outra
 * forma (value=, path=, arrays, produces=...) vira erro, para nunca esconder uma rota.
 * @param {string} source conteúdo do arquivo .java
 * @param {string} file caminho do arquivo, usado nas mensagens de erro
 * @returns {{endpoints: {method: string, path: string}[], errors: string[]}}
 */
function extractEndpoints(source, file) {
  const errors = [];
  const raw = (source.match(/@(Get|Post|Put|Delete|Patch|Request)Mapping/g) ?? []).length;
  let prefix = "";
  let prefixes = 0;
  const endpoints = [];
  for (const m of source.matchAll(/@(Get|Post|Put|Delete|Patch|Request)Mapping\b(?:\s*\(([^)]*)\))?/g)) {
    const args = m[2]?.trim() ?? "";
    const literal = /^"([^"]*)"$/.exec(args);
    if (args !== "" && !literal) {
      errors.push(`${file}: @${m[1]}Mapping(${args}) usa argumento que não é um literal simples; ajuste o script ou o código`);
      continue;
    }
    const path = literal?.[1] ?? "";
    if (m[1] === "Request") { prefix = path; prefixes++; }
    else endpoints.push({ method: m[1].toUpperCase(), path });
  }
  if (prefixes > 1) errors.push(`${file}: mais de um @RequestMapping (o script assume uma classe por arquivo)`);
  if (raw !== endpoints.length + prefixes + errors.filter((e) => e.includes("argumento")).length) {
    errors.push(`${file}: ${raw} anotações *Mapping encontradas, mas só ${endpoints.length + prefixes} foram interpretadas`);
  }
  return { endpoints: endpoints.map((e) => ({ method: e.method, path: (prefix + e.path) || "/" })), errors };
}

/** Expande {nome} e {nome:a|b} em listas de valores de amostra. */
function placeholderOptions(token, samples) {
  const regex = /^\{[^:}]+:([^}]+)\}$/.exec(token)?.[1];
  if (regex && /^[\w-]+(\|[\w-]+)*$/.test(regex)) return regex.split("|");
  return samples ?? SAMPLES;
}

/**
 * Gera os caminhos concretos de um endpoint (sem barra inicial), trocando cada {variável} por amostras.
 * @param {string} path caminho no formato do Spring
 * @param {string[]} [samples] amostras próprias do endpoint (usadas no lugar de SAMPLES)
 * @returns {string[]}
 */
function concretePaths(path, samples) {
  const segments = path.replace(/^\//, "").split("/");
  return segments.reduce(
    (acc, s) => acc.flatMap((prefix) =>
      (s.startsWith("{") ? placeholderOptions(s, samples) : [s]).map((value) => (prefix === null ? value : `${prefix}/${value}`))),
    [null],
  );
}

// Coleta os endpoints de cada serviço Spring (o nome da pasta em services/ é o serviço de destino).
const endpoints = [];
const parseErrors = [];
for (const service of readdirSync(join(root, "services"), { withFileTypes: true })) {
  if (!service.isDirectory()) continue;
  const src = join(root, "services", service.name, "src/main/java");
  try { readdirSync(src); } catch { continue; }
  for (const file of javaFiles(src)) {
    const result = extractEndpoints(readFileSync(file, "utf8"), file);
    parseErrors.push(...result.errors);
    for (const { method, path } of result.endpoints) endpoints.push({ service: service.name, method, path });
  }
}
const backupSource = readFileSync(join(root, BACKUP_SOURCE), "utf8");
for (const endpoint of BACKUP_ENDPOINTS) {
  if (!backupSource.includes(endpoint.source))
    parseErrors.push(`${BACKUP_SOURCE}: não encontrei ${endpoint.source} (${endpoint.method} ${endpoint.path}); atualize BACKUP_ENDPOINTS`);
  endpoints.push({ service: "backup", ...endpoint });
}

if (parseErrors.length > 0) {
  console.error("Não foi possível interpretar todos os endpoints:");
  for (const e of parseErrors) console.error(`  ${e}`);
  process.exit(1);
}

const keyOf = (e) => `${e.service} ${e.method} ${e.path}`;
const keys = new Set(endpoints.map(keyOf));
const problems = [];
let viaBff = 0;

for (const endpoint of [...endpoints].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
  const key = keyOf(endpoint);
  const targets = concretePaths(endpoint.path, endpoint.samples).map((path) => ({ path, target: resolveRoute(endpoint.method, path) }));
  const reached = targets.filter((t) => t.target !== null);

  if (INTERNAL_ONLY.has(key)) {
    // Interno precisa continuar fora do proxy em TODAS as amostras, com o método HTTP real.
    for (const t of reached) problems.push(`${key} está marcado como interno, mas ${endpoint.method} /api/v1/${t.path} passa pelo proxy`);
    continue;
  }
  if (reached.length === 0) {
    if (PENDING_REVIEW.has(key)) console.warn(`AVISO: ${key} sem chamador confirmado (PENDING_REVIEW)`);
    else problems.push(`${key} não passa pelo BFF e não está em INTERNAL_ONLY/PENDING_REVIEW`);
    continue;
  }
  // Limitação: basta UMA amostra casar para o endpoint contar como coberto. Ex.: em
  // PUT /me/library/{id}/{action} o script não prova que TODAS as ações estão no BFF.
  for (const t of reached) {
    if (t.target !== endpoint.service) problems.push(`${key}: o BFF manda ${endpoint.method} /api/v1/${t.path} para "${t.target}"`);
  }
  viaBff++;
}

// Sentido inverso: toda regra do BFF precisa levar a um endpoint que existe no serviço de destino.
for (const [method, pattern, target] of routes) {
  const served = endpoints.some((e) => e.service === target && e.method === method
    && concretePaths(e.path, e.samples).some((path) => pattern.test(path)));
  if (!served) problems.push(`regra do BFF ${method} ${pattern} -> ${target} não corresponde a nenhum endpoint de ${target}`);
}

// Entradas que não existem mais no código viram lixo na lista: avisa para limpar.
for (const key of [...INTERNAL_ONLY.keys(), ...PENDING_REVIEW.keys()]) {
  if (!keys.has(key)) console.warn(`AVISO: ${key} está nas listas mas não existe mais no código`);
}

if (problems.length > 0) {
  console.error("Contrato BFF ↔ serviços quebrado:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`OK: ${keys.size} endpoints (${viaBff} via BFF, ${keys.size - viaBff} internos/pendentes), ${routes.length} regras do BFF com destino conferido.`);
