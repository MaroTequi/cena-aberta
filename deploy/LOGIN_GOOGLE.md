# Login com o Google em produção (alpha)

Este guia liga o botão **Entrar com Google** na alpha publicada pelo Tailscale Funnel. O cliente OAuth criado para testar no computador (`Cena Aberta local`, com retorno em `localhost`) **não serve** para produção: o Google só devolve a pessoa para os endereços cadastrados no cliente, e cada ambiente tem o seu.

## Como funciona, em uma frase

O Google confirma quem é a pessoa e devolve para o Cena Aberta, que entra na conta de mesmo e-mail (ou cria uma nova, respeitando `INVITE_ONLY`). O site só mostra o botão quando `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` estão preenchidos; sem eles, a alpha segue só com e-mail e senha.

## Um cliente por ambiente

| Ambiente | Onde roda | Endereço de retorno no Google | Arquivo com as chaves |
|---|---|---|---|
| Local (desenvolvimento) | `node scripts/local.mjs` | `http://localhost:3000/api/auth/callback/google` | `.env` da raiz |
| Homologação | `python deploy/release.py hml <commit>` | `http://localhost:3001/api/auth/callback/google` | `deploy/.env.hml` |
| Produção (alpha) | `python deploy/release.py promover <SHA>` | `https://<ALPHA_URL>/api/auth/callback/google` | `deploy/.env` |

Use o mesmo projeto do Google Cloud (`cena-aberta-login`) e **um cliente OAuth separado para produção**. Assim a chave de produção nunca passa pelo computador de desenvolvimento, e dá para trocar ou desligar uma sem afetar a outra.

## Antes de começar

- O commit com o login do Google (migration `V34__google_identity.sql`) já precisa estar na branch que vai para produção. A migration roda sozinha quando o serviço social sobe.
- Tenha em mãos o `ALPHA_URL` de `deploy/.env`, por exemplo `https://cena-aberta-alpha.tailxxxx.ts.net` (sem `/` no fim).
- Acesso à conta Google dona do projeto `cena-aberta-login` no Google Cloud.

## Parte 1 — Google Cloud

Sempre com `?project=cena-aberta-login` no fim do endereço, para o Console não abrir em outro projeto.

### 1. Branding (a tela que a pessoa vê ao entrar)

Abra https://console.cloud.google.com/auth/branding?project=cena-aberta-login e confira:

- **Nome do app:** `Cena Aberta`
- **E-mail de suporte:** o seu
- **Logotipo:** deixe **sem logotipo** por enquanto. Com logotipo, o Google costuma exigir verificação da marca antes de publicar.
- **Página inicial do app:** o `ALPHA_URL`
- **Domínios autorizados:** o domínio do `ALPHA_URL` (a parte depois de `https://`, sem o nome da máquina se o Console pedir só o domínio)
- **E-mail de contato do desenvolvedor:** o seu

> Atenção: o Google só aceita em "Domínios autorizados" domínios que ele reconhece como registráveis. Se recusar o domínio `*.ts.net` do Funnel, a saída é publicar a alpha num domínio próprio (ex.: `cenaaberta.com.br`) e usar esse domínio no `ALPHA_URL` e aqui. Confira isso **antes** de anunciar o login com Google.

### 2. Criar o cliente de produção

Abra https://console.cloud.google.com/auth/clients?project=cena-aberta-login → **Criar cliente**:

- **Tipo de aplicativo:** Aplicativo da Web
- **Nome:** `Cena Aberta produção`
- **Origens JavaScript autorizadas:** o `ALPHA_URL`, sem barra no fim. Ex.: `https://cena-aberta-alpha.tailxxxx.ts.net`
- **URIs de redirecionamento autorizados:** o `ALPHA_URL` + `/api/auth/callback/google`. Ex.: `https://cena-aberta-alpha.tailxxxx.ts.net/api/auth/callback/google`
- **Usar este cliente para um agente com tecnologia de IA:** desmarcado
- **Criar**

Copie o **ID do cliente** e a **Chave secreta** direto para o arquivo do servidor (Parte 2). A chave só aparece inteira nessa hora. **Não cole a chave em chat, issue, commit, print ou histórico de comandos.**

### 3. Quem pode entrar

Abra https://console.cloud.google.com/auth/audience?project=cena-aberta-login. Escolha um dos dois caminhos:

| Caminho | Como fica | Quando usar |
|---|---|---|
| **Manter "Testando"** (recomendado para a alpha) | Só entram as contas Google listadas em **Usuários de teste** (até 100). O Google mostra o aviso "app não verificado", e a pessoa clica em **Continuar**. | Enquanto a alpha é só para convidados. Coloque aqui os mesmos Gmails de `INVITED_EMAILS`. |
| **Publicar o app** ("Em produção") | Qualquer conta Google consegue chegar ao Cena Aberta; o `INVITE_ONLY` continua barrando quem não foi convidado. | Quando abrir o cadastro. Com só nome, e-mail e foto (sem logotipo), o Google em geral não pede verificação, mas confira a mensagem do Console na hora. |

## Parte 2 — Servidor da alpha

### 4. Colocar as chaves no arquivo privado

No servidor, edite `deploy/.env` (ignorado pelo Git, permissão `600`) e preencha:

```
GOOGLE_CLIENT_ID=<ID do cliente de produção>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<chave secreta do cliente de produção>
```

Use um editor (`nano deploy/.env`), não `echo` no terminal, para a chave não ficar no histórico. Confira também se os Gmails dos convidados estão em `INVITED_EMAILS`: quem entra pelo Google com um e-mail novo só ganha conta se estiver convidado.

### 5. Homologar antes

1. Para testar o Google também na homologação, crie mais um cliente (`Cena Aberta homologação`, retorno `http://localhost:3001/api/auth/callback/google`) e coloque as chaves em `deploy/.env.hml`. Sem elas, a homologação sobe normal, só sem o botão.
2. `python deploy/release.py hml <commit>` e abra http://localhost:3001/conta.
3. Depois de homologar, promova o mesmo commit: `python deploy/release.py promover <SHA>`.

### 6. Aplicar em produção

A promoção recria os contêineres e já lê as chaves novas. Se a versão já estiver em produção e você só acrescentou as chaves agora, recrie apenas o frontend:

```shell
docker compose --env-file deploy/.env -f compose.yaml -f compose.alpha.yaml up -d --no-deps --wait web
```

Reiniciar um contêiner existente **não** relê o arquivo; é preciso recriar com o comando acima.

## Parte 3 — Validar

De uma rede externa (celular fora do Wi-Fi, sem Tailscale):

1. `https://<ALPHA_URL>/api/auth/providers` deve listar `google` além de `email-account`.
2. Abra `https://<ALPHA_URL>/conta`: o botão **Entrar com Google** aparece abaixo do formulário.
3. Entre com um Gmail que **já tem conta** na alpha → cai na mesma conta (nada de perfil novo).
4. Entre com um Gmail **convidado e sem conta** → cria a conta e pede para completar o perfil.
5. Entre com um Gmail **não convidado** → volta para `/conta` com "O cadastro está aberto só para convidados".
6. Se aparecer `redirect_uri_mismatch`: o endereço no cliente não bate com o `ALPHA_URL`. Confira `https`, barra no fim e o nome da máquina. Mudanças no cliente podem levar de minutos a algumas horas para valer.

## Manutenção

- **Trocar a chave secreta:** no cliente de produção, **Adicionar chave secreta** → atualize `deploy/.env` → recrie o `web` (passo 6) → valide o login → **desative** a chave antiga no Console.
- **Desligar o login com Google:** apague os valores de `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` em `deploy/.env` e recrie o `web`. O botão some; quem entrou pelo Google continua com a conta e pode definir uma senha em "Esqueci a senha".
- **Mudou o `ALPHA_URL`?** Atualize as origens e os URIs de redirecionamento do cliente de produção antes de trocar o endereço.
- **Chave vazou?** Troque imediatamente (primeiro item) e desative a antiga.

## Dados e privacidade

- O Cena Aberta guarda só o identificador da pessoa no Google (tabela `google_identity`) e o e-mail que já usa para a conta. Nenhum token do Google é armazenado.
- Contas criadas pelo Google não têm senha conhecida; para usar e-mail e senha, a pessoa define uma em "Esqueci a senha".
- Excluir a conta remove o vínculo; se a pessoa entrar de novo pelo Google, nasce uma conta nova.
