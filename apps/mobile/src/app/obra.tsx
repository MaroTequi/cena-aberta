import { router, useLocalSearchParams } from "expo-router";
import { Image } from "react-native";
import { useCallback } from "react";
import { detail, defaultSeries } from "../data";
import { Screen, Heading, Label, Copy, Action, useLoad, Pending } from "../ui";
export default function Obra() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useLoad(useCallback(() => detail(id), [id]));
  const title = load.data;
  return (
    <Screen>
      {title ? (
        <>
          <Label>
            {title.anime ? "ANIME" : title.format === "tv" ? "SÉRIE" : "FILME"}{" "}
            · {title.year}
          </Label>
          {id === defaultSeries && (
            <Image
              accessible={false}
              source={require("../../assets/mare-alta.png")}
              style={{
                width: "100%",
                aspectRatio: 900 / 350,
                borderRadius: 14,
              }}
            />
          )}
          <Heading>{title.name}</Heading>
          <Copy>{title.summary}</Copy>
          {title.format === "tv" && (
            <Action
              title="Ver temporadas"
              onPress={() =>
                router.push({
                  pathname: "/temporadas",
                  params: { id, name: title.name },
                })
              }
            />
          )}
        </>
      ) : (
        <Pending {...load} />
      )}
    </Screen>
  );
}
