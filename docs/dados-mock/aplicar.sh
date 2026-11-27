#!/usr/bin/env bash
# Aplica docs/dados-mock/seed.sql no banco H2 local do serviço social (data/social.mv.db).
# Rodar da RAIZ do projeto, com o app PARADO:  ./docs/dados-mock/aplicar.sh
set -euo pipefail

if [[ ! -f docs/dados-mock/seed.sql || ! -d data ]]; then
  echo "Rode da raiz do projeto (onde existem as pastas data/ e docs/)." >&2
  exit 1
fi
if [[ ! -f data/social.mv.db ]]; then
  echo "Não achei data/social.mv.db. Suba o app uma vez (npm run local) para criar o banco e rodar as migrações." >&2
  exit 1
fi

H2="${H2_JAR:-$HOME/.m2/repository/com/h2database/h2/2.2.224/h2-2.2.224.jar}"
if [[ ! -f "$H2" ]]; then
  echo "H2 2.2.224 não encontrado em $H2 (defina H2_JAR com o caminho do h2-2.2.224.jar)." >&2
  exit 1
fi
if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then JAVA="$JAVA_HOME/bin/java"; else JAVA="$(command -v java || true)"; fi
if [[ -z "$JAVA" ]]; then echo "Java não encontrado (use o Java 21)." >&2; exit 1; fi

URL="jdbc:h2:file:./data/social;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE"

# O H2 em arquivo só aceita um processo por vez: se o app estiver rodando, o arquivo fica travado.
if [[ -f data/social.lock.db ]] || (command -v lsof >/dev/null && lsof data/social.mv.db >/dev/null 2>&1); then
  echo "O banco data/social.mv.db está em uso (o serviço social parece estar rodando). Pare o app (Ctrl+C no npm run local) e tente de novo." >&2
  exit 2
fi

cp data/social.mv.db data/social.mv.db.antes-da-massa
if ! SAIDA=$("$JAVA" -cp "$H2" org.h2.tools.RunScript -url "$URL" -user sa -password "" -script docs/dados-mock/seed.sql -showResults 2>&1 >/dev/null); then
  if grep -qiE "already in use|Locked by another process|lock" <<<"$SAIDA"; then
    echo "O banco data/social.mv.db está travado por outro processo. Pare o app e tente de novo." >&2
    exit 2
  fi
  echo "Falha ao aplicar o seed:" >&2
  echo "$SAIDA" >&2
  echo "Cópia de segurança do banco antes da tentativa: data/social.mv.db.antes-da-massa" >&2
  exit 1
fi
echo "Massa aplicada em data/social.mv.db (cópia anterior em data/social.mv.db.antes-da-massa)."
echo "Logins e senhas: docs/dados-mock/README.md"
