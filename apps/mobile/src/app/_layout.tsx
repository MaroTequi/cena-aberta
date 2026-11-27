import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { onlineAvailable, session } from "../data";
import { useEffect, useState } from "react";
import { Account, ink, paper } from "../ui";
export default function Layout() {
  const [real, setReal] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (onlineAvailable ? session() : Promise.resolve(null))
      .then((actor) => {
        if (active) setReal(Boolean(actor));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loading) return null;
  return (
    <Account.Provider value={{ real, setReal }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerTitle: "Cena Aberta",
          headerStyle: { backgroundColor: ink },
          headerTintColor: paper,
          contentStyle: { backgroundColor: ink },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!real}>
          <Stack.Screen name="boas-vindas" />
          <Stack.Screen name="login" />
          <Stack.Screen name="cadastro" />
        </Stack.Protected>
        <Stack.Protected guard={real}>
          <Stack.Screen name="explorar" />
          <Stack.Screen name="obra" />
          <Stack.Screen name="temporadas" />
          <Stack.Screen name="episodio" />
        </Stack.Protected>
      </Stack>
    </Account.Provider>
  );
}
