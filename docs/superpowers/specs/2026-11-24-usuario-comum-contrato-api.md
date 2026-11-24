# Contrato da API: funcionalidades do usuário comum

> Branch `feat/usuario-comum` · 24/11/2026 · fonte da verdade para o frontend e para a massa de dados.
> Plano de origem: `docs/superpowers/plans/2026-11-24-usuario-comum.md`. Os desvios do plano estão na seção 13.

## 0. Regras gerais

- **Caminho no navegador:** sempre `/api/v1/<rota>`. O BFF (Backend for Frontend, o proxy do Next.js em `apps/web/app/api/v1/[...path]/route.ts`) repassa para o serviço social com `X-Actor` (o usuário da sessão) e a chave interna. A lista de rotas liberadas fica em `apps/web/lib/api-routes.ts`.
- **Métodos que alteram dados** (PUT, POST, DELETE) precisam do cabeçalho `Origin` igual ao do site (o `fetch` do navegador já manda). O corpo vai em JSON, com limite de 16 KB.
- **Conta:** toda rota exige perfil ativo. Perfil suspenso → `403 "Acesso suspenso."`. Sem perfil → `404 "Registro não encontrado."` (o BFF normalmente já barra antes com `403 PROFILE_REQUIRED`).
- **Erros:** o corpo é o JSON padrão do Spring, e a mensagem para mostrar fica em `message`:
  ```json
  {"timestamp":"2026-11-24T15:00:00.000+00:00","status":409,"error":"Conflict","message":"Coleção alterada. Atualize a página.","path":"/me/collections/0f8f..."}
  ```
- **Datas e horas:** nas rotas novas, todo instante sai em ISO-8601 UTC terminando em `Z` (ex.: `"2026-11-24T15:04:05.123456Z"`; a quantidade de casas decimais varia). Datas sem hora saem como `"AAAA-MM-DD"`.
- **Ids:** obra = `demo-<slug>` ou `tmdb-movie-<n>` / `tmdb-tv-<n>`. Coleção, comentário e recomendação = UUID em minúsculas (36 caracteres). O BFF só aceita esse formato no caminho.
- **Usuários (username):** aceitam espaços e símbolos, então **nunca vão no caminho da URL**. Vão como query `?username=` (encode com `encodeURIComponent`) ou no corpo JSON.
- **Notas:** escala da `library.rating`, de 1 a 10 (para estrelas, divida por 2).
- **Amigo aceito:** existe linha em `friendship` com `status='accepted'` entre as duas pessoas, em qualquer direção, e as duas estão com `profile.active=true`.

## 1. Coleções

Uma coleção é uma lista ordenada de obras criada pelo usuário. Quem não é o dono só vê as coleções quando o dono tem `profile.show_lists=true`.

### `GET /api/v1/me/collections[?title=<id da obra>]`
Coleções do próprio usuário, das mais novas para as mais antigas (até 100).
```json
{"items":[{"id":"0f8fad5b-d9cb-469f-a165-70867728950e","name":"Favoritos","description":"Os que eu revejo",
  "version":3,"count":5,"titles":["tmdb-movie-603","demo-ultimo-rolo","tmdb-tv-1399","tmdb-movie-155"]}]}
```
`titles` traz até 4 obras (as primeiras posições, para a capa). `count` é o total de obras.
Com `?title=<id da obra>` cada coleção ganha também `"has": true|false`, dizendo se a obra está nela em qualquer posição (use isto, e não `titles`, para saber se a obra já foi adicionada). `title` com formato inválido → 400 `"Identificador inválido."`.

### `POST /api/v1/me/collections`
Corpo `{"name":"Favoritos","description":"opcional"}`. O nome é aparado e precisa ter de 1 a 100 caracteres; a descrição, até 500 (`null` vira `""`).
Cabeçalho opcional `Idempotency-Key` (8 a 80 caracteres `[A-Za-z0-9_-]`): repetir com a mesma chave e o mesmo corpo devolve a mesma coleção.
Resposta 200: o detalhe (formato do GET abaixo), com `version: 0` e `items: []`.
Erros: 400 nome vazio ou longo, descrição longa, `"Limite de 100 coleções."`, chave inválida; 409 `"Chave já usada com outros dados."`.

### `GET /api/v1/me/collections/{id}`
```json
{"id":"0f8f...","name":"Favoritos","description":"","version":3,
 "items":[{"title":"tmdb-movie-603","position":0},{"title":"demo-ultimo-rolo","position":1}]}
```
404 se a coleção não existe ou não é do usuário.

### `PUT /api/v1/me/collections/{id}`
Corpo `{"name":"...","description":"...","version":3}` (as mesmas regras do POST). Resposta: o detalhe com `version+1`.
409 `"Coleção alterada. Atualize a página."` se `version` é diferente da atual ou foi omitida. 404 se não é do usuário.

### `DELETE /api/v1/me/collections/{id}`
Resposta `{"deleted":true}`. 404 se não existe ou não é do usuário.

### `PUT /api/v1/me/collections/{id}/items`
Corpo `{"version":3,"titles":["tmdb-movie-603","demo-ultimo-rolo"]}`. Substitui a lista inteira, e a ordem do array vira `position` 0, 1, 2… Resposta: o detalhe com `version+1`.
Erros: 400 `"Use até 100 obras."` (lista ausente ou com mais de 100), `"Obra repetida na coleção."`, `"Identificador inválido."`; 404 `"Obra não encontrada."` (obra nova que o catálogo não conhece); 409 versão.
`"titles": []` esvazia a coleção.

### `GET /api/v1/collections?username=<username>`
Coleções de outra pessoa (ou do próprio usuário), no mesmo formato de `GET /me/collections`.
403 `"Listas privadas."` quando o dono tem `show_lists=false` e quem pede é outra pessoa. 404 se o usuário não existe ou está inativo.

### `GET /api/v1/collections/{id}`
O detalhe de qualquer coleção, mais o dono:
```json
{"id":"0f8f...","name":"Favoritos","description":"","version":3,"items":[...],
 "owner":{"username":"bia","name":"Bia","avatar":"preset:cinema"}}
```
Segue a mesma regra de `show_lists` (403). 404 se não existe ou se o dono está inativo.

## 2. Estatísticas / retrospectiva

### `GET /api/v1/me/stats?year=2025`
`year` é opcional (o padrão é o ano atual no fuso de São Paulo) e vai de 1900 a 2200; fora disso, 400 `"Ano inválido."`.
```json
{"year":2025,"years":[2025,2024],"viewings":42,"distinctTitles":37,"rewatches":5,"minutes":3120,
 "byMonth":[3,2,5,4,1,0,6,7,3,4,5,2],
 "byFormat":{"movie":20,"tv":12,"anime":5},
 "topGenres":[{"name":"Drama","count":14},{"name":"Comédia","count":9}],
 "averageRating":7.85,"ratingHistogram":[0,1,0,2,3,4,6,8,5,3],
 "topRated":[{"title":"tmdb-movie-603","rating":10},{"title":"demo-ultimo-rolo","rating":9}]}
```
- A base são as sessões do diário (`viewing`) com `watched_on` dentro do ano. Sessão sem data não entra.
- `years`: anos que têm alguma sessão, do mais novo para o mais antigo (`[]` se não há nenhuma).
- `viewings` = sessões; `distinctTitles` = obras distintas; `rewatches` = sessões com `rewatch=true`.
- `byMonth`: 12 posições (janeiro = índice 0) com sessões por mês.
- `byFormat`: **obras distintas** por formato. Se o catálogo marca a obra como anime, ela conta como `anime`; senão conta pelo `format` (`movie`/`tv`). Obra que o catálogo não acha não conta.
- `minutes`: soma a duração de cada sessão (rever conta de novo), **só de filmes** (`format=movie`, inclusive filmes de anime). Série fica de fora porque a duração é por episódio e o diário não registra episódios. Filme sem duração no catálogo conta 0.
- `topGenres`: até 5 gêneros, contando obras distintas; empate é desfeito por ordem alfabética. Os nomes vêm em português (`"Ação"`, `"Ficção científica"`…).
- `averageRating`: média (2 casas) da `library.rating` das obras vistas no ano que têm nota, na escala 1 a 10. `null` se nenhuma tem nota. Séries não têm `library.rating` (a nota delas é por episódio), então não entram.
- `ratingHistogram`: 10 posições; o índice `i` conta as notas `i+1`.
- `topRated`: até 5 obras do ano com nota, da maior para a menor (empate pelo id).
- Se o catálogo estiver fora do ar: 503 `"Catálogo indisponível."`.

## 3. Meta anual

### `GET /api/v1/me/goal?year=2025`
`year` é opcional (padrão = ano atual em SP), de 1900 a 2200.
```json
{"year":2025,"target":50,"done":37}
```
`target` fica `null` quando não há meta. `done` = obras **distintas** com sessão no diário naquele ano.

### `PUT /api/v1/me/goal`
Corpo `{"year":2025,"target":50}`. `target` vai de 1 a 1000; `null` remove a meta. Resposta no mesmo formato do GET.
400: `"Informe o ano."`, `"Ano inválido."`, `"A meta deve ficar entre 1 e 1000 obras."`.

## 4. Exportar dados

### `GET /api/v1/me/export`
Resposta 200 com corpo binário:
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="cena-aberta-2026-11-24.zip"` (data de hoje em SP)

No frontend, baixe com `fetch` → `blob()` → link com `download`, ou simplesmente navegue para a URL. O BFF repassa `Content-Disposition` e o corpo intacto (com prazo de 30 s).

Conteúdo do ZIP: 5 CSVs em UTF-8 **com BOM**, separador vírgula, aspas quando precisa, fim de linha CRLF, primeira linha = cabeçalho. Só entram dados do próprio usuário. Os ids das obras aparecem sem o nome (o nome fica no catálogo).

| Arquivo | Colunas |
|---|---|
| `biblioteca.csv` | `obra,assistida,vou_ver,revendo,nota,resenha,spoiler,avaliacao_publica,oculta,nota_em,resenha_em` |
| `diario.csv` | `id,obra,data,revisto,assistido_em,registrado_em` |
| `ranking.csv` | `obra,categoria,posicao` (categoria 0 a 4) |
| `colecoes.csv` | `colecao_id,colecao,descricao,posicao,obra` (coleção vazia vira 1 linha com `posicao` e `obra` vazias) |
| `episodios.csv` | `obra,temporada,episodio,nota` |

Formato das células: booleano = `sim`/`não`; instante = ISO UTC; data = `AAAA-MM-DD`; null = vazio. Texto livre que começa com `= + - @`, tab ou CR ganha um `'` na frente, para a planilha não executar como fórmula.

## 5. Filtros e ordenação da biblioteca

### `GET /api/v1/library-page?section=watched|watchlist&page=1[&username=...][&sort=...][&filter=...]`
A resposta é a mesma de antes: `{"items":[...],"pages":N}`, com 24 itens por página e cada item no mesmo formato de antes. Só entram dois parâmetros novos:

| `sort` | Efeito |
|---|---|
| `title` (padrão) | Ordem antiga (pelo id da obra). Sem `sort`/`filter`, a resposta é idêntica à anterior. |
| `recent` | Sessão mais recente do diário primeiro; obra sem sessão vai para o fim. No `watchlist`, e para visitante quando o dono tem `show_diary=false`, cai na ordem `title` (a ordem revelaria datas privadas). |
| `rating` | Maior nota primeiro, sem nota no fim. O visitante ordena só pela nota que pode ver (pública e não oculta). |
| `name` | Nome do catálogo, A→Z (ordem alfabética pt-BR, ignora acentos). Obra sem metadado vai para o fim. |
| `year` | Ano do catálogo, do mais novo para o mais antigo; sem ano vai para o fim. |

| `filter` | Efeito |
|---|---|
| `all` (padrão) | Sem filtro. |
| `unrated` / `rated` | Sem nota / com nota (para visitante, conta só a nota visível). |
| `min:N` | Nota visível maior ou igual a N (N de 1 a 10). |
| `movie` / `tv` / `anime` | Pelo catálogo: anime → `anime`; senão pelo `format`. Obra sem metadado sai. |

`name`, `year`, `movie`, `tv` e `anime` consultam o catálogo: são lidas até 2000 linhas da biblioteca e paginadas em memória. Valor inválido → 400 `"Filtro ou ordenação inválidos."`.

## 6. Feed de amigos

### `GET /api/v1/feed[?before=<cursor>]`
```json
{"items":[
  {"kind":"reviewed","actor":{"username":"bia","name":"Bia","avatar":"preset:cinema"},"title":"tmdb-movie-603",
   "rating":9,"review":"Revi e continua ótimo.","spoiler":false,"at":"2026-11-24T14:00:00Z"},
  {"kind":"rated","actor":{...},"title":"demo-ultimo-rolo","rating":7,"review":null,"spoiler":false,"at":"2026-11-24T13:00:00Z"},
  {"kind":"watched","actor":{...},"title":"tmdb-tv-1399","rating":null,"review":null,"spoiler":false,"at":"2026-11-23T22:10:00Z"}],
 "next":"2026-11-20T10:00:00Z"}
```
- Até 20 itens, do mais novo para o mais antigo. Para a próxima página, chame `?before=<next>`. `next` vem `null` quando acabou. `before` inválido → 400 `"Cursor inválido."`.
- Todas as chaves estão sempre presentes: `rating`/`review` ficam `null` quando não se aplicam, e `spoiler` é booleano.
- Só aparecem **amigos aceitos e ativos**. A própria atividade não entra.
- `watched`: uma sessão do diário (`viewing`). O `at` é o `watched_at` quando existe; senão, o `created`. **Exige `show_diary=true` do amigo**, porque a sessão revela a data, que hoje só fica pública com o diário. Para não inundar o feed com importações, a sessão só entra se `watched_on` for nulo ou no máximo 60 dias anterior à data do cursor (o cursor é agora na primeira página).
- `rated`: a nota atual da obra, no instante `library.rated_at`. Exige `evaluation_public=true` e `hidden=false`.
- `reviewed`: a resenha atual, no instante `library.reviewed_at`, com `rating` (se houver) e `spoiler` efetivo (o marcado pelo autor ou o decidido pelos votos de spoiler). As mesmas exigências de `rated`.
- Linhas da biblioteca com `rated_at`/`reviewed_at` nulos (dados anteriores à V27 e importações do Letterboxd) não aparecem.
- `before`/`next` são opacos para o cliente: o `next` é um cursor composto (`<instante ISO>|<tipo>|<usuário>|<id da sessão>|<título>`) com ordem de desempate estável (`at` desc, tipo, usuário, id, título), então itens no mesmo instante paginam sem se perder nem repetir. Um `before` só com o instante ISO (primeira forma, sem desempate) continua válido. Basta repassar o `next` recebido, codificado na URL.

## 7. Compatibilidade

### `GET /api/v1/friends/compatibility?username=<amigo>`
```json
{"username":"bia","shared":12,"agreement":81,
 "agree":[{"title":"tmdb-movie-603","mine":10,"theirs":10}],
 "disagree":[{"title":"demo-ultimo-rolo","mine":2,"theirs":8}]}
```
- `shared` = obras em que as duas pessoas têm `library.rating`. Do amigo, só contam notas públicas (`evaluation_public=true` e `hidden=false`); do próprio usuário, todas.
- `agreement` = `round(100 − média(|minha − dele|) × 100 / 9)`, de 0 a 100. Fica `null` quando `shared < 3`.
- `agree`: até 10 obras com diferença ≤ 1, da menor diferença para a maior. `disagree`: até 10 com diferença ≥ 3, da maior para a menor.
- Erros: 403 `"Disponível apenas para amigos."`; 400 `"Escolha outra pessoa."` (a própria pessoa); 404 se o usuário não existe ou está inativo.

## 8. Amigos que viram

### `GET /api/v1/titles/{id}/friends`
```json
{"items":[{"username":"bia","name":"Bia","avatar":"","watched":true,"interest":false,
           "rating":9,"review":"Lindo.","spoiler":true}]}
```
- Amigos aceitos e ativos que têm linha na `library` para a obra, ordenados por username (até 50).
- `watched` só vem `true` se o amigo tem `show_watched=true`. `interest` (Vou ver) só vem `true` se ele tem `show_watchlist=true`.
- `rating`, `review` e `spoiler` só aparecem se a avaliação é pública (`evaluation_public=true` e `hidden=false`); se não, vêm `null`/`null`/`false`. Séries não têm `rating`.
- O amigo some da lista quando nada dele é visível.
- 400 para id de obra inválido.

## 9. Curtir e comentar resenhas

Só valem para resenhas que aparecem na comunidade: `review` não nulo, `evaluation_public=true`, `hidden=false` e autor ativo. Para qualquer outra, a resposta é 404 `"Resenha não encontrada."`.

### `GET /api/v1/titles/{id}/reviews` (e `reviews` dentro de `GET /titles/{id}/community`)
Cada resenha ganha três campos:
```json
{"username":"bia","name":"Bia","avatar":"","rating":9,"review":"...","version":2,"spoiler":false,"my_vote":null,
 "likes":4,"liked":true,"comments":2}
```
`likes` = total de curtidas; `liked` = se o usuário da sessão curtiu; `comments` = comentários de autores ativos.

### `PUT /api/v1/titles/{id}/review-like`
Corpo `{"username":"bia","value":true}` (`false` descurte). É idempotente. Resposta `{"likes":4,"liked":true}`.
Erros: 400 `"Informe se curtiu."`; 403 `"Você não pode curtir a própria resenha."`; 404.

### `GET /api/v1/titles/{id}/review-comments?username=<autor da resenha>`
```json
{"items":[{"id":"6f1c...","author":{"username":"ana","name":"Ana","avatar":""},"body":"Concordo!",
           "at":"2026-11-24T15:00:00Z","mine":true,"canDelete":true}],"total":2}
```
Traz os 100 comentários mais recentes, exibidos do mais antigo para o mais novo. `total` conta todos. `mine` diz se o comentário é do usuário da sessão; `canDelete` diz se ele pode apagar (é o autor do comentário ou da resenha). Comentários de contas inativas não aparecem.

### `POST /api/v1/titles/{id}/review-comments`
Corpo `{"username":"bia","body":"Concordo!"}`. O texto é aparado e precisa ter de 1 a 1000 caracteres. Resposta: o comentário criado, no formato de item acima.
Erros: 400 `"Campo obrigatório."` / `"Texto acima do limite de 1000 caracteres."`; 404.

### `DELETE /api/v1/titles/{id}/review-comments/{commentId}`
Resposta `{"deleted":true}`. 404 se o comentário não existe nessa obra; 403 `"Você não pode apagar este comentário."`.

**Ciclo de vida:** editar o texto da resenha mantém curtidas e comentários. Apagar a resenha (texto vazio) apaga os dois. Excluir a linha da biblioteca apaga tudo em cascata.

## 10. Recomendar a um amigo

### `POST /api/v1/recommendations`
Corpo `{"recipient":"bia","title":"tmdb-movie-603","message":"opcional"}`. A mensagem é aparada e vai até 300 caracteres; vazia vira `null`.
```json
{"id":"9b2e...","recipient":{"username":"bia","name":"Bia","avatar":""},"title":"tmdb-movie-603",
 "titleName":"Matrix","message":"Você vai gostar","created":"2026-11-24T15:00:00Z","duplicate":false}
```
- Só funciona entre amigos aceitos: 403 `"Disponível apenas para amigos."`; 400 `"Escolha outra pessoa."`; 404 se o usuário não existe.
- Recomendar de novo a mesma obra para a mesma pessoa devolve a recomendação existente **sem alterar nada**, com `"duplicate":true` (status 200). Assim o sino não toca de novo.
- No máximo 30 recomendações novas a cada 24 h por remetente: passou disso, 429 `"Limite de 30 recomendações por dia."`.
- 404 `"Obra não encontrada."` se o catálogo não conhece a obra; 400 para id inválido; 503 se o catálogo está fora.
- O nome da obra é guardado na hora (`title_name`), para o sino não precisar consultar o catálogo.

### `GET /api/v1/recommendations[?offset=0]`
Recomendações recebidas, das mais novas para as mais antigas, 50 por página (`offset` de 0 a 100000). Remetentes inativos ficam de fora.
```json
{"items":[{"id":"9b2e...","sender":{"username":"ana","name":"Ana","avatar":""},"title":"tmdb-movie-603",
           "titleName":"Matrix","message":"Você vai gostar","created":"2026-11-24T15:00:00Z","seen":false}],
 "unseen":1,"hasMore":false}
```

### `PUT /api/v1/recommendations/{id}/read`
Marca como lida (sai do sino). Resposta `{"read":true}`. 404 se não existe ou não foi enviada para o usuário.

### `GET /api/v1/notifications` (alterado)
Os itens agora têm o campo `id` (sempre presente):
```json
{"items":[{"kind":"recommendation","target":"tmdb-movie-603","label":"Matrix","sender":"Ana","id":"9b2e..."},
          {"kind":"friend","target":"bia","label":"Bia","sender":"Bia","id":null}],"total":2}
```
Para `kind:"recommendation"`: `target` = id da obra, `label` = nome da obra, `sender` = **nome** de quem recomendou (o mesmo padrão dos convites de sala) e `id` = id da recomendação, usado no `PUT /recommendations/{id}/read`. Só entram as não lidas de remetentes ativos. Nos outros tipos, `id` vem `null`. A chave React deve ser `kind + target + id`, porque a mesma obra pode vir de dois amigos.

## 11. Visibilidade do perfil (alterado)

- `PUT /api/v1/me/visibility` aceita `section:"lists"` (liga e desliga `show_lists`). `section:"all"` agora inclui `lists`.
- O mapa `visibility` (em `GET /me`, `GET /profiles/...` e na resposta do PUT) ganhou a chave `lists`: `{"watchlist":false,"ranking":false,"watched":true,"diary":false,"lists":true}`.

## 12. Schema final (V27 + o que já existia e é usado)

```sql
-- library (já existia; V27 adiciona as duas últimas colunas)
library(actor varchar(160) FK profile ON DELETE CASCADE, title varchar(90), watched boolean, interest boolean,
        rating integer CHECK 1..10 NULL, review varchar(3000) NULL, spoiler boolean, hidden boolean, version integer,
        rewatching boolean, evaluation_public boolean DEFAULT false,
        rated_at timestamptz NULL,     -- V27: momento da última mudança de nota; NULL = sem nota ou dado antigo
        reviewed_at timestamptz NULL,  -- V27: momento da última mudança do texto da resenha
        PRIMARY KEY(actor,title))
-- índices V27: library_actor_rated(actor,rated_at), library_actor_reviewed(actor,reviewed_at), viewing_actor_watched_on(actor,watched_on)

-- collection / collection_item (já existiam desde a V1; sem mudança)
collection(id varchar(36) PK, actor varchar(160) FK profile ON DELETE CASCADE, name varchar(100), description varchar(500) NOT NULL,
           version integer DEFAULT 0, created timestamptz DEFAULT CURRENT_TIMESTAMP)
collection_item(collection_id varchar(36) FK collection ON DELETE CASCADE, title varchar(90), position integer,
                PRIMARY KEY(collection_id,title), UNIQUE(collection_id,position))
-- position começa em 0 e é contínua.

CREATE TABLE annual_goal (
 actor varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 goal_year integer NOT NULL CHECK(goal_year BETWEEN 1900 AND 2200),
 target integer NOT NULL CHECK(target BETWEEN 1 AND 1000),
 PRIMARY KEY(actor,goal_year));

CREATE TABLE review_like (
 author varchar(160) NOT NULL, title varchar(90) NOT NULL,          -- a resenha = library(author,title)
 liker varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 created timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(author,title,liker),
 FOREIGN KEY(author,title) REFERENCES library(actor,title) ON DELETE CASCADE,
 CHECK(author <> liker));

CREATE TABLE review_comment (
 id varchar(36) PRIMARY KEY,                                         -- UUID minúsculo
 author varchar(160) NOT NULL, title varchar(90) NOT NULL,           -- a resenha comentada
 commenter varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 body varchar(1000) NOT NULL,
 created timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(author,title) REFERENCES library(actor,title) ON DELETE CASCADE);
-- índice review_comment_review(author,title,created)

CREATE TABLE recommendation (
 id varchar(36) PRIMARY KEY,                                         -- UUID minúsculo
 sender varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 recipient varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 title varchar(90) NOT NULL,
 title_name varchar(300) NOT NULL,                                   -- nome da obra no momento do envio
 message varchar(300),                                               -- NULL = sem mensagem
 created timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 seen boolean NOT NULL DEFAULT false,
 UNIQUE(sender,recipient,title), CHECK(sender <> recipient));
-- índices recommendation_inbox(recipient,seen,created), recommendation_sender_created(sender,created)
```

Colunas já existentes que as regras usam: `profile.show_watchlist|show_ranking|show_watched|show_diary|show_lists` (padrões: false, false, true, false, true); `profile.active`; `friendship(id,requester,recipient,status 'pending'|'accepted',created)`; `viewing(id,actor,title,watched_on date NULL,rewatch,watched_at timestamptz NULL,created timestamptz)`; `review_spoiler_vote` (o spoiler efetivo é `spoiler=true` ou saldo de votos ≥ 2).

**Para a massa de dados:**
- O actor precisa casar com `[A-Za-z0-9_-]{8,160}`.
- Ids de coleção, comentário e recomendação devem ser UUID minúsculo, senão o BFF recusa as rotas com id.
- Para aparecer no feed: amizade `accepted`, perfil ativo e, para sessões, `show_diary=true`, com `watched_on` até 60 dias antes de "agora". Notas e resenhas precisam de `evaluation_public=true` e de `rated_at`/`reviewed_at` preenchidos.
- A obra precisa existir no catálogo (`demo-*` sempre existe; `tmdb-*` precisa estar na tabela `title` do catálogo ou haver `TMDB_TOKEN`). Isso vale para estatísticas, filtros por formato, nome/ano e recomendações.

## 13. Desvios do plano e decisões

1. **Username fora do caminho da URL.** O username aceita espaços e símbolos (`ProfileFields.username`), e o BFF só libera `[a-z0-9_]` no caminho. Por isso seguimos o padrão que o projeto já usa (`/profiles?username=`, `/friends/profile?username=`, o corpo de `spoiler-vote`):
   - `GET /profiles/{username}/collections` → `GET /collections?username=`, mais `GET /collections/{id}` (novo, para abrir a coleção de outra pessoa).
   - `GET /friends/compatibility/{username}` → `GET /friends/compatibility?username=`.
   - `PUT /titles/{id}/reviews/{username}/like` → `PUT /titles/{id}/review-like` com `{username,value}`.
   - `GET|POST /titles/{id}/reviews/{username}/comments` → `GET /titles/{id}/review-comments?username=` e `POST /titles/{id}/review-comments` com `{username,body}`.
   - `DELETE /titles/{id}/reviews/{username}/comments/{commentId}` → `DELETE /titles/{id}/review-comments/{commentId}` (o id do comentário já identifica a resenha).
2. **`annual_goal.goal_year`** no lugar de `year`: `YEAR` é palavra reservada no H2.
3. **`recommendation.title_name`** (coluna extra): guarda o nome da obra para o `/notifications` não chamar o catálogo a cada consulta do sino.
4. **`/notifications` ganhou `id`** em todos os itens, porque sem o id da recomendação o frontend não teria como marcá-la como lida.
5. **Recomendação repetida** devolve a existente (`duplicate:true`) em vez de 409 ou de reenviar; há limite diário de 30 (429) e o GET é paginado (`offset`, `hasMore`, `unseen`).
6. **Feed, item `watched`:** exige `show_diary` (e não `show_watched`), porque revela a data da sessão. Também foi criada a janela de 60 dias contra a inundação por importação. Não houve backfill de `rated_at`/`reviewed_at`, e a importação do Letterboxd não preenche essas colunas (histórico em massa não vira "novidade").
7. **Estatísticas:** `byFormat` conta obras distintas; `averageRating` usa a escala 1 a 10; séries ficam fora da média (não têm `library.rating`) e dos minutos.
8. **`library-page`:** o valor padrão de `sort` é `title` (a ordem antiga). `recent` não se aplica ao Vou ver (não há data) nem ao visitante sem diário público.
9. **Visibilidade:** a seção `lists` passou a ser configurável (antes não havia rota para mudar `show_lists`).
10. **Comentários:** a resposta traz os campos extras `canDelete` e `total` e mostra os 100 mais recentes.
11. **Catálogo:** `GET /title-batch` aceita `details=true` (rota interna, usada pelo social), que devolve `details.genres` e `details.runtime`. Sem esse parâmetro, nada muda.
12. **Exportação:** traz ids em vez dos nomes das obras (o nome mora no catálogo); booleanos saem como `sim`/`não`; textos com cara de fórmula ganham um `'` na frente.
