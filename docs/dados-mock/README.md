# Massa de dados para teste visual

> **Só para ambiente local.** As senhas abaixo são públicas (estão neste arquivo, que vai para o Git). Nunca aplique isto em produção nem em banco compartilhado.

Pense numa vitrine de loja de teste: a gente enche as prateleiras com produtos de mentira para ver como a loja fica com gente de verdade circulando. Aqui são 5 pessoas fictícias com amizades, notas, resenhas, diário, coleções, metas e recomendações, para você abrir o app e já ver as 10 funcionalidades novas funcionando sem ter que cadastrar tudo na mão.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `seed.sql` | A massa em si. Roda no H2 (banco local) e no PostgreSQL 16. |
| `aplicar.sh` | Aplica o `seed.sql` no H2 local (`data/social.mv.db`). |
| `README.md` | Este guia. |

A massa é **idempotente**: dá para aplicar quantas vezes quiser. Ela apaga só as linhas dos 5 usuários fictícios (identificados pelos actors fixos `account_mock...`) e reinsere. Suas contas reais (`admin`, `teste` e os e-mails que você já usa) não são tocadas, e nenhum username ou e-mail da massa colide com elas.

## Como aplicar

### 1. Garanta que a V27 já rodou

A V27 é a migração (script que altera o schema do banco) que cria as tabelas novas: metas, curtidas, comentários e recomendações. Ela roda sozinha quando o serviço social sobe. Então, **se o banco ainda é antigo, suba o app uma vez** (`node scripts/local.mjs`, da raiz), espere subir e pare (Ctrl+C). Se esquecer, o `seed.sql` falha dizendo que a tabela `annual_goal` (ou outra) não existe.

### 2. H2 local (o caminho normal)

Com o app **parado**, da **raiz do projeto**:

```bash
export JAVA_HOME=~/.sdkman/candidates/java/21.0.3-librca PATH=~/.sdkman/candidates/java/21.0.3-librca/bin:$PATH
./docs/dados-mock/aplicar.sh
```

O que o script faz:

- Recusa rodar fora da raiz, sem `data/social.mv.db` ou com o app rodando (o H2 em arquivo só deixa um processo mexer por vez; ele avisa com mensagem clara e código de saída 2).
- Copia o banco para `data/social.mv.db.antes-da-massa` (a pasta `data/` é ignorada pelo Git).
- Roda o `seed.sql` com `org.h2.tools.RunScript` usando o H2 **2.2.224** de `~/.m2` (pode trocar o jar com a variável `H2_JAR`).

Depois é só subir o app (`node scripts/local.mjs`) e logar.

### 3. PostgreSQL do Docker Compose

Com o `compose.yaml` no ar (serviço `social-db`, banco `social`, usuário `social`) e a V27 já aplicada pelo serviço social:

```bash
docker compose exec -T social-db psql -U social -d social -v ON_ERROR_STOP=1 < docs/dados-mock/seed.sql
```

Se você expõe a porta do Postgres, também serve `psql "postgresql://social:SENHA@localhost:PORTA/social" -v ON_ERROR_STOP=1 -f docs/dados-mock/seed.sql`.

### Detalhes que vale saber

- **Datas recentes são relativas a "agora"** (`CURRENT_TIMESTAMP - INTERVAL ...`). Assim o feed (que só mostra coisas dos últimos 60 dias para diário) fica sempre cheio quando você reaplica. Já as sessões "do ano" são fixas em 2026 e 2025; se você usar a massa em 2027, a retrospectiva de 2026 continua lá, só o "ano atual" muda.
- **Obras:** são IDs reais do TMDB (`tmdb-movie-N`, `tmdb-tv-N`) e algumas `demo-*`. Na primeira vez que alguém abre uma obra, o catálogo busca no TMDB (precisa do `TMDB_TOKEN` no `.env`) e guarda em cache. Sem token, as telas de obras `tmdb-*` que ainda não estão no cache falham.
- **Senhas:** hash BCrypt força 12, o mesmo encoder do `EmailAccounts`. O login é por **e-mail + senha**.

## Logins

| E-mail | Senha | Username | Papel | O que testar com este usuário |
|---|---|---|---|---|
| `marina.admin@cenaaberta.test` | `Admin@Mock2026!` | `marina admin` | **admin** | Painel de feedback (`/admin/feedback`, com 2 relatos); aparece como amiga da Ana; recomendou um filme para ela. |
| `ana.silva@cenaaberta.test` | `Ana@Cinema2026!` | `ana silva` | comum | A "conta principal" de teste: tudo cheio. Estatísticas, meta, feed, coleções, compatibilidade, sino com recomendações e pedido de amizade. |
| `bruno.costa@cenaaberta.test` | `Bruno@Series2026!` | `bruno costa` | comum | Amigo da Ana: gosto parecido e divergente, séries e animes, resenhas que ela pode curtir/comentar, spoiler marcado pela comunidade. |
| `carla.nunes@cenaaberta.test` | `Carla@Fechada2026!` | `carla nunes` | comum | Perfil **fechado** (prova de privacidade): nada de diário, lista de vistos, ranking, Vou ver nem coleções para os outros. |
| `diego.lima@cenaaberta.test` | `Diego@Novato2026!` | `diego lima` | comum | Usuário novo, quase vazio: estados vazios; ainda **não é amigo** de ninguém (mandou pedido pendente para a Ana). |

Todos os e-mails são do domínio fictício `@cenaaberta.test` e todas as senhas atendem a regra do cadastro (12+ caracteres, maiúscula, minúscula, número e símbolo).

## O que tem na massa, por usuário

**Amizades:** Ana é amiga de Bruno, Carla e Marina. Bruno e Carla também são amigos. Diego mandou pedido para a Ana e está **pendente** (aparece no sino dela).

### Ana Silva (aberta, vitrine completa)
- Visibilidade: tudo aberto (Vou ver, ranking, vistos, diário, listas).
- Biblioteca: 18 vistos (notas de 5 a 10; alguns sem nota) e 6 no Vou ver, séries (Breaking Bad, Game of Thrones, Stranger Things), `demo-*`. Resenhas públicas (duas com spoiler: Cidade de Deus e Parasita), uma resenha e nota **privadas** (A Origem), uma obra em "revendo" (WALL-E). Algumas notas antigas **sem data** (não entram no feed, de propósito).
- Diário: 27 sessões em 2026 (18 obras distintas, 9 revisualizações) e 11 em 2025, espalhadas pelos meses, 8 delas nos últimos 60 dias.
- Meta: 40 obras em 2026 (feitas: 18) e 25 em 2025 (feitas: 10).
- Ranking pessoal com as 5 faixas preenchidas (10 filmes).
- Coleções: "Favoritos de sempre" (5 obras), "Para chorar no cinema" (3), "Maratona de sábado" (4, filmes e séries) e "Coleção vazia" (0).
- Notas por episódio: Breaking Bad (T1 e T2), Game of Thrones (T1), Maré Alta.
- Sino: 3 recomendações **não lidas** (Marina, Bruno e Bruno) + o pedido de amizade do Diego. Uma recomendação da Carla já **lida**.

### Bruno Costa
- Visibilidade: tudo aberto, exceto **Vou ver** (fechado).
- Notas fortes (Parasita 3, O Iluminado 9, Cidade de Deus 10) que contrastam com as da Ana. Tem anime (Chihiro, Your Name, Jujutsu Kaisen, Attack on Titan, One Piece) e séries.
- Compatibilidade com a Ana: **8 obras em comum** com notas públicas, concordância de uns 81%; 6 em que concordam e 2 em que discordam (Parasita e O Iluminado).
- Diário: sessões em 2026 e nos últimos 60 dias, uma sessão **sem data** (importada) e uma de 90 dias atrás (fora da janela do feed).
- Meta de 20 em 2026. Ranking próprio. Duas coleções ("Animes essenciais", "Séries para maratonar").
- Resenha de Attack on Titan sem spoiler marcado, mas com 2 votos da comunidade, então aparece **como spoiler**.
- Tem 1 recomendação não lida (da Ana).

### Carla Nunes (a fechada)
- Visibilidade: **tudo fechado** (vistos, Vou ver, ranking, diário e listas). Mesmo assim tem ranking, diário, coleção e meta (que só ela enxerga).
- Só 2 avaliações públicas (Matrix 8 e Cidade de Deus 10), então a compatibilidade com a Ana dá **2 obras em comum e concordância `null`** (menos de 3). As outras notas e resenhas dela são privadas.
- Para os amigos, em "Amigos que viram" ela aparece com a nota pública, mas **sem** marcar "assistiu" (porque os vistos dela são privados).
- Tem 1 recomendação não lida (da Ana) e uma lida (do Bruno).

### Diego Lima
- Perfil padrão (diário fechado), 3 obras, 1 sessão de diário, meta 5 em 2026.
- Pedido de amizade **pendente** para a Ana. Sem recomendações.

### Marina Admin
- Administradora. 2 obras, 1 sessão de diário (aberto), e dois feedbacks de usuários no painel (um bug "novo" da Ana, uma sugestão "em análise" do Bruno).

### Interações em resenhas
- Curtidas e comentários cruzados entre Ana, Bruno, Carla e Marina (ex.: 3 curtidas e 3 comentários na resenha da Ana sobre Matrix; discussão na resenha negativa do Bruno sobre Parasita).
- Votos de spoiler na resenha de Attack on Titan.

## Roteiro rápido de teste visual

> As telas novas estão sendo construídas no frontend, então nomes de página podem mudar. Os caminhos abaixo são os atuais do projeto.

1. **Coleções** (logar como **Ana**): perfil/biblioteca → coleções. Veja as 4 (uma vazia). Crie, renomeie, adicione e reordene obras. Depois entre como **Bruno** e abra as coleções da Ana; com a **Carla** a tela deve dizer que as listas são privadas.
2. **Retrospectiva/estatísticas** (**Ana**): troque entre 2026 e 2025. Espere minutos assistidos, meses, formatos (filme, série, anime), gêneros e melhores notas. Em 2024 deve aparecer vazio.
3. **Meta anual** (**Ana**): barra com 18 de 40 em 2026. Edite a meta. Com **Diego**, ajuste a meta de 5.
4. **Exportar dados** (**Ana**, em `/conta/configuracoes`): baixa um `.zip` com 5 planilhas (biblioteca, diário, ranking, coleções, episódios).
5. **Filtros e ordenação da biblioteca** (**Ana**, em Vistos): ordene por nota, recentes, nome, ano; filtre por filme, série, anime, "sem nota", "nota 8 ou mais". Como **Bruno** olhando a Ana, `recentes` ainda funciona (ela abriu o diário); olhando a Carla, a aba de vistos vem vazia (privada).
6. **Feed de amigos** (**Ana** ou **Carla** em `/feed`): lista mista de "assistiu", "avaliou" e "resenhou", com mais de 20 itens (clique em "carregar mais"). Note que o diário da Carla não aparece (diário fechado) e que a sessão do Bruno de 90 dias atrás não entra.
7. **Compatibilidade** (**Ana** em `/amigos`, entrando no Bruno): 8 obras em comum, concordância e as listas "concordam" / "discordam". Com a Carla: 2 em comum, sem porcentagem. Com o Diego: bloqueado (só amigos).
8. **Amigos que viram** (**Ana**, abrindo Matrix, Cidade de Deus ou Interestelar): veja quem assistiu, quem quer ver e as notas/resenhas visíveis. A Carla aparece só com a nota pública.
9. **Curtir e comentar resenhas** (**Bruno** abrindo Matrix): a resenha da Ana tem 3 curtidas e 3 comentários. Curta, comente, apague um comentário seu. Tente curtir a própria resenha (deve recusar). A resenha de Attack on Titan aparece escondida como spoiler.
10. **Recomendar a um amigo** (**Ana**, em qualquer obra): recomende a obra para o Bruno ou a Carla (o Diego não deve aparecer, não é amigo). Repita a mesma e veja que não duplica nem toca o sino de novo. Depois entre com **Bruno** e veja no sino.
11. **Sino** (**Ana**): 3 recomendações novas + o pedido do Diego. Abra uma e ela sai do sino. Aceite o pedido do Diego e veja ele virar amigo.
12. **Visibilidade do perfil** (**Carla**, em `/conta/perfil`): a opção de **listas** agora existe. Ligue e desligue e confira com a Ana vendo o perfil da Carla. (A Carla está fechada em tudo de propósito.)
13. **Admin** (**Marina**, `/admin/feedback`): veja os 2 relatos; mude o status; com a Ana a rota deve negar.

## Reaplicar ou limpar

- Reaplicar: rode o `aplicar.sh` de novo (app parado). Mudanças que você fez nas contas da massa voltam ao estado inicial.
- Voltar ao estado de antes da primeira aplicação: copie `data/social.mv.db.antes-da-massa` por cima de `data/social.mv.db` (app parado). Atenção: a cópia é sobrescrita a cada execução, então ela guarda só o estado imediatamente anterior à última aplicação.
- Para remover só a massa, apague as 5 contas: rode apenas a seção "1) Limpeza" do `seed.sql`.
