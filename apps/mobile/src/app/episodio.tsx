import { useLocalSearchParams } from "expo-router";
import { useState, useCallback } from "react";
import { View, Pressable, Text } from "react-native";
import { items, rating, save, defaultSeries } from "../data";
import {
  Screen,
  Heading,
  Label,
  Action,
  Copy,
  useLoad,
  Pending,
  gold,
  ink,
  paper,
} from "../ui";
export default function Episode() {
  const {
      s,
      e,
      id = defaultSeries,
      name = "Mar\u00e9 Alta",
    } = useLocalSearchParams<{
      s: string;
      e: string;
      id?: string;
      name?: string;
    }>(),
    season = Number(s),
    episode = Number(e);
  const load = useLoad(
    useCallback(async () => {
      const [rows, value] = await Promise.all([
        items(season, id),
        rating(season, episode, id),
      ]);
      const row = rows.find((x) => x.number === episode);
      if (!row) throw Error("Episódio não encontrado.");
      return { row, value };
    }, [season, episode, id]),
  );
  const [draft, setDraft] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [message, notify] = useState("");
  const selected = draft ?? load.data?.value;
  async function submit() {
    if (!selected) return;
    setBusy(true);
    notify("");
    try {
      await save(season, episode, selected, id);
      notify("Nota salva na sua conta.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Label>
        {name} · T{season} E{episode}
      </Label>
      {load.data ? (
        <>
          <Heading>{load.data.row.name}</Heading>
          {!!load.data.row.summary && <Copy>{load.data.row.summary}</Copy>}
          <Label>MINHA AVALIAÇÃO</Label>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={n / 2 + " de 5"}
                accessibilityState={{ selected: n === selected }}
                disabled={busy}
                onPress={() => {
                  setDraft(n);
                  notify("");
                }}
                style={{
                  padding: 12,
                  minWidth: 48,
                  alignItems: "center",
                  backgroundColor: n === selected ? gold : "#282d39",
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: n === selected ? ink : paper }}>
                  {String(n / 2).replace(".", ",")}
                </Text>
              </Pressable>
            ))}
          </View>
          <Action
            title="Salvar avaliação"
            onPress={submit}
            disabled={!selected || busy}
          />
          {!!message && <Copy>{message}</Copy>}
        </>
      ) : (
        <Pending {...load} />
      )}
    </Screen>
  );
}
