# Alpha com Tailscale Funnel

## Homologação e publicação

No host Docker, use `python deploy/release.py hml <commit>` com um commit revisado disponível no Git local. Abra http://localhost:3001 e a caixa de testes em http://localhost:8025. O primeiro deploy gera segredos em `deploy/.env.hml`. O catálogo usa dados ilustrativos até configurar um token TMDB próprio. Cada instalação tem bancos independentes.

Para incluir uma mudança do Luiz, reconcilie o PR com a versão de referência e implante o commit resultante na homologação. Um push sozinho executa a CI. Depois do merge, homologue a ponta exata da main. Para publicar, execute explicitamente `python deploy/release.py promover <SHA>` no mesmo host. A promoção verifica as imagens, faz backup do original e usa as imagens testadas. O comando antigo `alpha.py up` serve para a instalação inicial.

## Estado e requisitos

O Compose mantém dois PostgreSQL persistentes e publica somente o frontend em `127.0.0.1:3000`. Os serviços reiniciam com o Docker e os logs têm rotação. O comando `up` espera pela saúde do frontend e dos dois serviços. O cadastro por convite e o SMTP são obrigatórios neste ambiente.

A execução pode usar Docker Desktop no Windows ou um servidor Linux. A infraestrutura deve ser provisionada e validada pelo responsável pela instalação; o projeto não depende de um provedor específico. O roteiro para Oracle abaixo é uma opção de hospedagem.

Referências: [Docker no Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [requisitos do Funnel](https://tailscale.com/docs/features/tailscale-funnel), [CLI Funnel](https://tailscale.com/docs/reference/tailscale-cli/funnel).

## Hospedar no PC Windows

A alpha também pode rodar localmente, sem contratar uma VM. Instale Docker Desktop (contêineres Linux), Python 3 e Tailscale. O PC precisa ficar ligado, conectado e sem suspensão durante os testes; o Docker Desktop precisa estar em execução. O reinício automático dos contêineres depende do Docker estar ativo.

Autentique o Tailscale pelo aplicativo ou com `tailscale up --hostname=cena-aberta-alpha`. Consulte `tailscale status --json` para obter `Self.DNSName`. Configure `ALPHA_URL` em `deploy/.env` com essa origem HTTPS e preencha os convidados e credenciais conforme o modelo. Esse arquivo é privado e ignorado pelo Git. Use `python` no lugar de `python3` nos comandos abaixo; no Windows, execute os comandos Tailscale sem `sudo`.

Execute `python deploy/alpha.py check`, `python deploy/alpha.py up` e, depois de verificar os serviços, `tailscale funnel --bg 3000`. Se o Tailscale solicitar habilitação de HTTPS/Funnel na conta, conclua pelo link oficial exibido e repita o comando. Publique apenas a porta do frontend. Para suspender a publicação, execute `tailscale funnel --https=443 off`.

Os volumes Docker desta alpha são separados dos dados do modo de desenvolvimento; contas e resenhas locais não são migradas automaticamente. Não apague volumes ao atualizar. Faça backups e mantenha uma cópia privada fora deste PC. Valide acesso por uma rede externa, convites, e-mails e login antes de distribuir o link.

## Preparar o servidor Oracle

1. Crie a VM e guarde sua chave SSH fora do repositório. Restrinja a entrada SSH ao seu endereço de administração. Não abra 3000, 8181, 8182 ou 5432 na internet. Permita saída para atualizações, TMDB, SMTP e Tailscale.
2. Instale Git, Python 3, Docker Engine e o plugin Docker Compose pelo guia oficial para Ubuntu. Habilite o serviço Docker no boot. Use uma conta autorizada a acessar o Docker.
3. Instale o Tailscale na própria VM e autentique-a com `sudo tailscale up --hostname=cena-aberta-alpha`. Confirme MagicDNS, HTTPS e permissão `funnel` na política da tailnet. O login interativo deve ser feito pelo responsável pela conta.
4. Consulte o nome DNS com `tailscale status --json` (campo `Self.DNSName`, removendo o ponto final). A origem pública será `https://` seguida desse nome. Preserve o nome da máquina para manter os links.
5. Clone o repositório e crie a configuração privada:

```bash
git clone https://github.com/MaroTequi/cena-aberta.git
cd cena-aberta
umask 077
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Preencha `deploy/.env` no servidor: `ALPHA_URL`, convidados, token TMDB, remetente Brevo verificado e credenciais SMTP. Gere cinco valores aleatórios distintos para os segredos internos, sessão e bancos, com pelo menos 32 caracteres; por exemplo `openssl rand -hex 32` para cada valor. Não cole segredos em issues, commits ou histórico de comandos. O modelo não contém credenciais.

## Subir e publicar

```bash
python3 deploy/alpha.py check
python3 deploy/alpha.py up
sudo tailscale funnel --bg 3000
tailscale funnel status
```

O comando `check` não exibe segredos. `up` compila para a arquitetura da VM e espera os serviços ficarem saudáveis. Não use o Compose base sozinho para o alpha: ele não força a restrição de cadastro. Qualquer pessoa pode abrir a página pública, mas novos cadastros exigem convite e confirmação de e-mail. Remover um convite não desativa uma conta existente.

Valide em rede externa, sem Tailscale instalado: login, convite autorizado, e-mail não autorizado, confirmação, recuperação e URLs recebidas por e-mail. Confirme o certificado reconhecido pelo navegador e o cookie seguro. Reinicie a VM e verifique a retomada. Só compartilhe após essa rodada. Para suspender o acesso público: `sudo tailscale funnel --https=443 off`.

## Backup e restauração de teste

```bash
python3 deploy/alpha.py backup
python3 deploy/alpha.py restore-check backups/PASTA_GERADA
```

O backup pausa temporariamente os serviços de aplicação para obter um par consistente dos bancos, gera dumps PostgreSQL, checksums e o commit de origem e retoma os serviços que estavam ativos. Isso exige uma janela curta de indisponibilidade. Não faça gravações externas nos bancos durante a operação. Só pastas com `manifest.json` são backups completos.

`restore-check` verifica checksums e restaura os dois bancos num PostgreSQL temporário sem rede e sem portas públicas, usando armazenamento em memória. Confere as tabelas de migração e remove apenas o contêiner temporário ao terminar. Não altera bancos de produção. Reserve memória suficiente para a cópia; para bases maiores, execute o ensaio em outro host Docker.

Copie cada backup concluído para armazenamento privado e criptografado **fora da VM**. Defina destino, retenção e frequência antes de convidar usuários; a transferência externa ainda não está automatizada. Os dumps contêm dados pessoais. Guarde separadamente a configuração privada, necessária para recuperar o ambiente. Não versione dumps ou credenciais.

Para recuperar após perda da VM, crie um ambiente separado com o commit do manifesto, configure os segredos, inicie apenas os dois bancos e restaure cada dump com `pg_restore --exit-on-error --no-owner --no-acl` em bancos vazios. Suba os serviços, valide contas e dados e só então aponte o Funnel para o ambiente recuperado. Não restaure sobre bancos em uso. O ensaio automático não substitui essa validação funcional de recuperação.

## Atualização

Faça backup e copie-o para fora antes de atualizar. Siga o fluxo de homologação e promoção acima. Confira saúde, migrações e fluxos. Para rollback com migração incompatível, recupere o par de bancos e o commit correspondente em ambiente separado; apenas trocar a imagem não reverte o banco. Nunca use `docker compose down -v` no ambiente real.

O GitHub Actions executa builds e testes da aplicação e um job ARM que compila o Compose, verifica saúde, faz backup e restaura em isolamento com dados descartáveis. SMTP real, TMDB real, acesso externo e disponibilidade da Oracle precisam ser validados no servidor.

## Atualizar a lista de convidados

Edite somente `INVITED_EMAILS` no arquivo privado. A aplicação lê essa variável ao criar o container. Reiniciar um container existente não carrega alterações do arquivo; recrie o serviço com os mesmos arquivos da implantação:

```shell
docker compose --env-file deploy/.env -f compose.yaml -f compose.alpha.yaml up -d --no-deps --wait social
```

A mensagem de cadastro é genérica: endereços não autorizados e contas já existentes não recebem novo link de cadastro. Na recuperação de senha, somente contas existentes recebem o link e o reenvio exige dois minutos. Não publique listas de convidados, credenciais ou logs contendo links de acesso.
