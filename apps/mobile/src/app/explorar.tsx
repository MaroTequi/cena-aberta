import { router } from "expo-router";
import { useState } from "react";
import { catalog, logout } from "../data";
import {
  Screen,
  Label,
  Heading,
  Copy,
  Action,
  useAccount,
  useLoad,
  Pending,
} from "../ui";
export default function Explorar() {
  const { setReal } = useAccount(),
    [error, setError] = useState("");
  const load = useLoad(catalog);
  return (
    <Screen>
      <Heading>Explorar</Heading>

      <Action
        title="Sair da conta"
        onPress={async () => {
          try {
            await logout();
            setReal(false);
            router.replace("/");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {!!error && <Copy>{error}</Copy>}
      <Label>CATÁLOGO</Label>
      {load.data ? (
        load.data.length ? (
          load.data.map((t) => (
            <Action
              key={t.id}
              title={t.name + "  ·  " + t.year}
              onPress={() =>
                router.push({ pathname: "/obra", params: { id: t.id } })
              }
            />
          ))
        ) : (
          <Copy>Nenhuma obra disponível.</Copy>
        )
      ) : (
        <Pending {...load} />
      )}
    </Screen>
  );
}
