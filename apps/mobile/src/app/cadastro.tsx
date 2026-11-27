import { router } from "expo-router";
import { useState } from "react";
import { register } from "../data";
import { Action, Copy, Field, Heading, Screen } from "../ui";

export default function Cadastro() {
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await register(email);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading>Criar conta</Heading>
      {sent ? (
        <>
          <Copy>
            Confira o e-mail informado e a pasta de spam. Abra o link para
            definir sua senha e completar o perfil no site. Depois, entre no
            app.
          </Copy>
          <Action
            title="Ir para o login"
            onPress={() => router.replace("/login")}
          />
        </>
      ) : (
        <>
          <Copy>
            A alpha é por convite. Informe o e-mail autorizado para receber o
            link de cadastro.
          </Copy>
          <Field
            accessibilityLabel="E-mail"
            placeholder="E-mail"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <Action
            title={busy ? "Enviando…" : "Enviar link de cadastro"}
            onPress={submit}
            disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
          />
          {!!error && <Copy>{error}</Copy>}
          <Action
            title="Já tenho conta"
            disabled={busy}
            onPress={() => router.replace("/login")}
          />
        </>
      )}
    </Screen>
  );
}
