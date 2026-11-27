import { origin, onlineAvailable } from "../data";
import { Redirect, router } from "expo-router";
import { Image, Pressable, Text, View, Platform, Linking } from "react-native";

import {
  Action,
  Copy,
  Label,
  Screen,
  gold,
  ink,
  paper,
  useAccount,
} from "../ui";

export default function Landing() {
  const { real } = useAccount();
  if (real) return <Redirect href="/explorar" />;

  function openAccount(create: boolean) {
    if (
      Platform.OS === "web" &&
      !onlineAvailable &&
      origin?.startsWith("https://")
    ) {
      void Linking.openURL(
        origin + (create ? "/conta?modo=register" : "/conta"),
      );
      return;
    }
    router.push(create ? "/cadastro" : "/login");
  }
  return (
    <Screen>
      <View style={{ gap: 14, paddingTop: 16 }}>
        <Label>FILMES · SÉRIES · ANIMES</Label>
        <Text
          accessibilityRole="header"
          style={{
            color: paper,
            fontSize: 40,
            lineHeight: 46,
            fontWeight: "800",
          }}
        >
          O que você vê.{"\n"}
          <Text style={{ color: gold }}>O que vocês vão ver.</Text>
        </Text>
        <Copy>
          Descubra filmes, séries e animes. Escolha uma obra e dê sua nota aos
          episódios que você viu.
        </Copy>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => openAccount(true)}
        style={({ pressed }) => ({
          backgroundColor: gold,
          opacity: pressed ? 0.8 : 1,
          padding: 16,
          borderRadius: 12,
          alignItems: "center",
        })}
      >
        <Text style={{ color: ink, fontSize: 17, fontWeight: "700" }}>
          Criar conta
        </Text>
      </Pressable>
      <Action
        title="Entrar com minha conta"
        onPress={() => openAccount(false)}
      />
      <Image
        source={require("../../assets/mare-alta.png")}
        accessible={false}
        resizeMode="cover"
        style={{
          width: "100%",
          aspectRatio: 2.5,
          borderRadius: 14,
          marginTop: 8,
        }}
      />
      <Action
        title="Rever apresentação"
        onPress={() =>
          router.replace({ pathname: "/", params: { rever: "1" } })
        }
      />
    </Screen>
  );
}
