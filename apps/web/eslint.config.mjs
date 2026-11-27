import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Flat config nativa do eslint-config-next 16 (sem @eslint/eslintrc).
export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Regras que exigiriam mudar comportamento (reexecutar efeitos, trocar <a> por <Link>, mover leituras de refs).
    // Rebaixadas para "warn" nesta tarefa; viram dívida técnica listada no relatório da tarefa 13.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "public/**", "next-env.d.ts"]),
]);
