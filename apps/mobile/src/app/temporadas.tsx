import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { items, defaultSeries } from "../data";
import { Screen, Heading, Label, Action, useLoad, Pending } from "../ui";
export default function Seasons() {
  const {
      s,
      id = defaultSeries,
      name = "Mar\u00e9 Alta",
    } = useLocalSearchParams<{ s?: string; id?: string; name?: string }>(),
    season = s === undefined ? undefined : Number(s);
  const load = useLoad(useCallback(() => items(season, id), [season, id]));
  return (
    <Screen>
      <Label>{name}</Label>
      <Heading>
        {season !== undefined ? "Temporada " + season : "Temporadas"}
      </Heading>
      {load.data ? (
        load.data.map((row) => (
          <Action
            key={row.number}
            title={
              season !== undefined
                ? "E" + row.number + " · " + row.name
                : "Temporada " + row.number
            }
            onPress={() =>
              season !== undefined
                ? router.push({
                    pathname: "/episodio",
                    params: { id, name, s: season, e: row.number },
                  })
                : router.push({
                    pathname: "/temporadas",
                    params: { id, name, s: row.number },
                  })
            }
          />
        ))
      ) : (
        <Pending {...load} />
      )}
    </Screen>
  );
}
