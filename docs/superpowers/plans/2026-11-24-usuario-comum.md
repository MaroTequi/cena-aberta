# Plano: novas funcionalidades do usuário comum (exploração)

> Branch `feat/usuario-comum`, criada a partir de `refactor/reconciliacao-alpha` · 24/11/2026
> Objetivo: exploração visual de 10 funcionalidades + massa de dados mockada. Não é PR para o dono do projeto.

## Decisões gerais

- **Backend:** tudo no serviço **social**, em controllers novos por domínio (padrão de `Library.java`, `Friends.java`), usando `Guards`, `ActiveActors` e `Rows`. Migração única nova `V32__usuario_comum.sql`. Testes JUnit no padrão de `services/social/src/test/...` (H2 + `ResourceDatabasePopulator`).
- **Contrato BFF:** toda rota nova entra em `apps/web/lib/api-routes.ts` (+ caso em `api-routes.test.ts`). `scripts/check-routes.mjs` precisa continuar passando.
- **Frontend:** páginas novas em pastas próprias (`apps/web/app/colecoes`, `estatisticas`, `feed`), componentes em arquivos próprios. O `app.tsx` recebe só o mínimo (links de navegação e pontos de encaixe).
- **Privacidade:** nada novo fura as regras atuais. Dados de terceiros só aparecem para **amigos aceitos** e/ou quando `library.evaluation_public = true`; seções de perfil respeitam `profile.show_*`.
- **Timestamps:** `library` não tem data de nota/resenha. A V32 adiciona `rated_at` e `reviewed_at`, preenchidos por `Library.java`. Sem eles o feed não tem ordem.

## Funcionalidades e contrato

Todas as rotas abaixo são do serviço social, recebem `X-Actor` e exigem conta ativa.

### 1. Coleções (tabelas `collection` e `collection_item` já existem; visibilidade em `profile.show_lists`)
- `GET /me/collections` → `{items:[{id,name,description,version,count,titles:[até 4 ids]}]}`
- `POST /me/collections` `{name,description}` → coleção criada (aceita `Idempotency-Key`)
- `GET /me/collections/{id}` → `{id,name,description,version,items:[{title,position}]}`
- `PUT /me/collections/{id}` `{name,description,version}` → conflito de versão = 409
- `DELETE /me/collections/{id}`
- `PUT /me/collections/{id}/items` `{version,titles:[ids na ordem]}` (substitui a lista; máx. 100)
- `GET /profiles/{username}/collections` → só se `show_lists` ou dono

### 2. Estatísticas / retrospectiva
- `GET /me/stats?year=AAAA` → `{year,years:[anos com sessões],viewings,distinctTitles,rewatches,minutes,byMonth:[12],byFormat:{movie,tv,anime},topGenres:[{name,count}],averageRating,ratingHistogram:[10],topRated:[{title,rating}]}`
- Gênero, duração e formato vêm do catálogo (`title-batch`, via `CatalogClient`). Minutos contam só filmes (duração de série por episódio fica fora, decisão registrada).

### 3. Meta anual
- `GET /me/goal?year=AAAA` → `{year,target|null,done}` (`done` = obras distintas vistas no ano pelo diário)
- `PUT /me/goal` `{year,target}` (1..1000; `null` remove)
- Tabela nova `annual_goal(actor,year,target)`.

### 4. Exportar dados
- `GET /me/export` → ZIP (`application/zip`, `Content-Disposition: attachment`) com `biblioteca.csv`, `diario.csv`, `ranking.csv`, `colecoes.csv`, `episodios.csv`, CSV em UTF-8 com BOM.
- O proxy do BFF (`app/api/v1/[...path]/route.ts`) passa a repassar `Content-Disposition` também nessa rota.

### 5. Filtros e ordenação da biblioteca
- `GET /library-page` ganha `sort=recent|rating|name|year` e `filter=all|unrated|rated|min:N|movie|tv|anime` (padrões preservam o comportamento atual).

### 6. Feed de amigos
- `GET /feed?before=<ISO>` → `{items:[{kind:watched|rated|reviewed,actor:{username,name,avatar},title,rating?,review?,spoiler,at}],next}` (20 por página)
- Só amigos aceitos e ativos. `watched` respeita `show_watched`/`show_diary`; `rated`/`reviewed` exigem `evaluation_public`.

### 7. Compatibilidade
- `GET /friends/compatibility/{username}` → `{username,shared,agreement:0..100|null,agree:[{title,mine,theirs}],disagree:[...]}`
- Só amigos; usa apenas notas públicas do outro. `agreement = 100 − média(|diferença|)×100/9`, `null` se `shared < 3`.

### 8. Amigos que viram
- `GET /titles/{id}/friends` → `{items:[{username,name,avatar,watched,interest,rating?,review?,spoiler}]}` (nota e resenha só se públicas)

### 9. Curtir e comentar resenhas
- Tabelas `review_like` e `review_comment` (FK para `library(actor,title)`, cascata).
- `PUT /titles/{id}/reviews/{username}/like` `{value}` → `{likes,liked}` (não pode curtir a própria)
- `GET /titles/{id}/reviews/{username}/comments` → `{items:[{id,author:{username,name,avatar},body,at,mine}]}`
- `POST /titles/{id}/reviews/{username}/comments` `{body}` (1..1000)
- `DELETE /titles/{id}/reviews/{username}/comments/{commentId}` (autor do comentário ou da resenha)
- `GET /titles/{id}/reviews` passa a trazer `likes`, `liked`, `comments` por resenha.

### 10. Recomendar a um amigo
- Tabela `recommendation(id,sender,recipient,title,message,created,seen)`, única por (sender,recipient,title).
- `POST /recommendations` `{recipient:username,title,message?}` → só para amigos
- `GET /recommendations` → recebidas
- `PUT /recommendations/{id}/read`
- `/notifications` passa a incluir `kind:'recommendation'` (target = título, label = nome do título, sender = quem recomendou).

## Telas

| Funcionalidade | Onde |
|---|---|
| Coleções | `/colecoes` e `/colecoes/[id]`; aba "Listas" no perfil de quem tem `show_lists`; botão "Adicionar à coleção" na obra |
| Estatísticas + meta | `/estatisticas` (retrospectiva por ano, meta com barra de progresso) |
| Exportar | botão em `/conta/configuracoes` |
| Filtros | barra de filtro/ordenação nas listas da biblioteca no perfil |
| Feed | `/feed` |
| Compatibilidade | bloco no perfil de amigo |
| Amigos que viram | seção na página da obra |
| Curtir/comentar | nos cards de resenha da comunidade |
| Recomendar | botão na página da obra; aviso no sino de notificações |

## Massa de dados

`docs/dados-mock/`: `seed.sql` (H2 e PostgreSQL), `aplicar.sh` (aplica no H2 local com o app parado) e `README.md` com usuários, senhas e o que cada um tem. 1 admin + 4 usuários comuns com amizades, notas, resenhas, diário, coleções, metas, curtidas, comentários e recomendações, usando IDs reais do TMDB.

## Execução

1. Backend + contrato do BFF (um agente), com testes.
2. Em paralelo: frontend (um agente) e massa de dados (outro agente).
3. Verificação: `mvn -B package`, lint/test/build do web, `scripts/check-routes.mjs`, `scripts/smoke.mjs`, app rodando com a massa aplicada e revisão independente.
