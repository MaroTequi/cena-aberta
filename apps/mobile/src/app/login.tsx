import { router } from "expo-router";
import { useState } from "react";
import { login } from "../data";
import { Screen, Heading, Copy, Action, Field, useAccount } from "../ui";
export default function Login() {
  const { setReal } = useAccount(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      setReal(true);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading>Entrar</Heading>
      <Field
        accessibilityLabel="E-mail"
        placeholder="E-mail"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <Field
        accessibilityLabel="Senha"
        placeholder="Senha"
        autoComplete="current-password"
        onSubmitEditing={submit}
        returnKeyType="go"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Action
        title={busy ? "Entrando…" : "Entrar"}
        disabled={busy || !email || !password}
        onPress={submit}
      />
      {!!error && <Copy>{error}</Copy>}
      <Action
        title="Criar conta"
        disabled={busy}
        onPress={() => router.replace("/cadastro")}
      />
    </Screen>
  );
}
