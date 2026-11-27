import Storage from "@react-native-async-storage/async-storage";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { gold, ink, paper, useAccount } from "../ui";

const completionKey = "cena-aberta:onboarding:v1";
const steps = [
  {
    topic: "EXPLORAR",
    title: "Descubra sua próxima história.",
    body: "Encontre filmes, séries e animes no catálogo. Abra uma obra para conhecer sua história.",
  },
  {
    topic: "EPISÓDIOS",
    title: "Uma temporada de cada vez.",
    body: "Na página da série, escolha a temporada e abra o episódio que você assistiu.",
  },
  {
    topic: "AVALIAÇÕES",
    title: "Que nota você daria?",
    body: "Avalie cada episódio de meia a cinco estrelas. Sua nota fica na mesma conta que você usa no site.",
  },
];

function Preview({ step }: { step: number }) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={s.preview}
    >
      <Image
        source={require("../../assets/mare-alta.png")}
        resizeMode="cover"
        style={s.art}
      />
      {step === 0 ? (
        <View style={s.posterCaption}>
          <Text style={s.micro}>SÉRIE · 2025</Text>
          <Text style={s.posterTitle}>Maré Alta</Text>
        </View>
      ) : (
        <View style={s.panel}>
          <Text style={s.micro}>
            {step === 1 ? "MARÉ ALTA" : "T1 · EPISÓDIO 1"}
          </Text>
          <Text style={s.panelTitle}>
            {step === 1 ? "Temporada 1" : "Piloto"}
          </Text>
          {step === 1 ? (
            <>
              <View style={s.row}>
                <Text style={s.number}>01</Text>
                <Text style={s.item}>Piloto</Text>
              </View>
              <View style={s.row}>
                <Text style={s.number}>02</Text>
                <Text style={s.item}>Segundo episódio</Text>
              </View>
            </>
          ) : (
            <View style={s.score}>
              <Text style={s.stars}>
                ★★★★<Text style={{ color: "#9299a5" }}>☆</Text>
              </Text>
              <Text style={s.item}>4 de 5</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function Onboarding() {
  const { real } = useAccount();
  const { rever } = useLocalSearchParams<{ rever?: string }>();
  const [seen, setSeen] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    let active = true;
    Storage.getItem(completionKey)
      .then((value) => {
        if (active) setSeen(value === "1");
      })
      .catch(() => {
        if (active) setSeen(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const pager = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  function go(next: number) {
    pager.current?.scrollTo({ x: next * width, animated: false });
    setStep(next);
  }
  async function finish() {
    try {
      await Storage.setItem(completionKey, "1");
    } catch {
      /* Navigation also works when local storage is unavailable. */
    }
    router.replace("/boas-vindas");
  }
  if (real) return <Redirect href="/explorar" />;
  if (seen === null) return null;
  if (seen && rever !== "1") return <Redirect href="/boas-vindas" />;
  const current = steps[step];
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.top}>
          <View style={s.brand}>
            <Image
              accessible={false}
              source={require("../../assets/icon.png")}
              style={s.logo}
            />
            <Text style={s.wordmark}>Cena Aberta</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={finish} style={s.link}>
            <Text style={s.linkText}>Pular tour</Text>
          </Pressable>
        </View>
        <View style={s.story}>
          <View
            onLayout={(event) => {
              const w = event.nativeEvent.layout.width;
              setWidth(w);
              pager.current?.scrollTo({ x: w * step, animated: false });
            }}
          >
            {width > 0 && (
              <ScrollView
                ref={pager}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) =>
                  setStep(
                    Math.max(
                      0,
                      Math.min(
                        steps.length - 1,
                        Math.round(event.nativeEvent.contentOffset.x / width),
                      ),
                    ),
                  )
                }
              >
                {steps.map((slide, i) => (
                  <View key={slide.topic} style={{ width }}>
                    <Preview step={i} />
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
          <Text style={s.micro}>{current.topic}</Text>
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={s.title}
          >
            {current.title}
          </Text>
          <Text style={s.body}>{current.body}</Text>
        </View>
        <View style={s.footer}>
          <View
            accessible
            accessibilityLabel={`Etapa ${step + 1} de ${steps.length}`}
            style={s.track}
          >
            {steps.map((part, i) => (
              <View
                key={part.topic}
                style={[s.segment, i <= step && s.filled]}
              />
            ))}
          </View>
          <View style={s.controls}>
            {step > 0 && (
              <Pressable
                accessibilityRole="button"
                style={s.link}
                onPress={() => go(step - 1)}
              >
                <Text style={s.linkText}>Voltar</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [s.button, pressed && { opacity: 0.8 }]}
              onPress={step === steps.length - 1 ? finish : () => go(step + 1)}
            >
              <Text style={s.buttonText}>
                {step === steps.length - 1 ? "Começar" : "Avançar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ink },
  content: {
    flexGrow: 1,
    maxWidth: 550,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 24,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 34, height: 34 },
  wordmark: { fontSize: 18, fontWeight: "800", color: paper },
  link: { paddingHorizontal: 8, minHeight: 48, justifyContent: "center" },
  linkText: { fontSize: 16, color: paper },
  story: { flexGrow: 1, justifyContent: "center", gap: 12 },
  preview: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#2c2431",
    minHeight: 236,
    justifyContent: "flex-end",
    padding: 18,
    marginBottom: 10,
  },
  art: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  posterCaption: {
    alignSelf: "flex-start",
    backgroundColor: "#1b1c29",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 3,
  },
  posterTitle: { fontSize: 30, fontWeight: "800", color: paper },
  micro: { color: gold, letterSpacing: 2, fontWeight: "700", fontSize: 12 },
  panel: { backgroundColor: "#1b1e29", borderRadius: 14, padding: 16, gap: 8 },
  panelTitle: { color: paper, fontSize: 22, fontWeight: "700" },
  row: {
    borderTopWidth: 1,
    borderColor: "#3d414c",
    flexDirection: "row",
    gap: 12,
    paddingTop: 7,
  },
  number: { color: gold, fontSize: 14 },
  item: { color: paper, fontSize: 15 },
  score: { gap: 4 },
  stars: { color: gold, fontSize: 30, letterSpacing: 2 },
  title: { color: paper, fontSize: 36, fontWeight: "800", lineHeight: 42 },
  body: { color: "#c7c9d0", fontSize: 17, lineHeight: 25 },
  footer: { gap: 18 },
  track: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#424651" },
  filled: { backgroundColor: gold },
  controls: { flexDirection: "row", gap: 18 },
  button: {
    flex: 1,
    backgroundColor: gold,
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: ink, fontSize: 17, fontWeight: "700" },
});
