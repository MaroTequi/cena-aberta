import React, { createContext, useContext, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View, TextInput } from "react-native";
export const Account = createContext({
  real: false,
  setReal: (_value: boolean) => {},
});
export const useAccount = () => useContext(Account);
export const gold = "#ffca77",
  ink = "#12151c",
  paper = "#f5f1e8";
export function Screen({ children }: React.PropsWithChildren) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: ink }}
      contentContainerStyle={{
        padding: 22,
        gap: 16,
        maxWidth: 680,
        width: "100%",
        alignSelf: "center",
        paddingBottom: 54,
      }}
    >
      {children}
    </ScrollView>
  );
}
export function Heading({ children }: React.PropsWithChildren) {
  return (
    <Text
      accessibilityRole="header"
      style={{ fontSize: 34, fontWeight: "800", color: paper }}
    >
      {children}
    </Text>
  );
}
export function Copy({ children }: React.PropsWithChildren) {
  return (
    <Text style={{ color: "#c7c9d0", fontSize: 16, lineHeight: 24 }}>
      {children}
    </Text>
  );
}
export function Label({ children }: React.PropsWithChildren) {
  return (
    <Text
      style={{ color: gold, fontWeight: "700", letterSpacing: 2, fontSize: 12 }}
    >
      {children}
    </Text>
  );
}
export function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? "#373138" : "#222733",
        borderColor: "#454955",
        borderWidth: 1,
        padding: 15,
        borderRadius: 12,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text style={{ color: paper, fontWeight: "700", fontSize: 17 }}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      autoCapitalize="none"
      placeholderTextColor="#a6a9b3"
      style={{
        backgroundColor: "#222733",
        color: paper,
        padding: 14,
        borderRadius: 10,
      }}
      {...props}
    />
  );
}
export function useLoad<T>(get: () => Promise<T>) {
  const [attempt, retry] = useState(0),
    [state, set] = useState<{
      data?: T;
      error?: string;
      get?: typeof get;
      attempt?: number;
    }>({});
  useEffect(() => {
    let current = true;
    get().then(
      (data) => {
        if (current) set({ data, get, attempt });
      },
      (e) => {
        if (current)
          set({ get, attempt, error: e.message || "Falha ao carregar." });
      },
    );
    return () => {
      current = false;
    };
  }, [get, attempt]);
  return {
    ...(state.get === get && state.attempt === attempt ? state : {}),
    retry: () => retry((n) => n + 1),
  };
}
export function Pending({
  error,
  retry,
}: {
  error?: string;
  retry: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Copy>{error || "Carregando…"}</Copy>
      {error && <Action title="Tentar novamente" onPress={retry} />}
    </View>
  );
}
