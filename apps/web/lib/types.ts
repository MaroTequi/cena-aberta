import type { PersonCredit } from "../app/work-people";

export type TitleDetails = {
  genres: string[];
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  directors: string[];
  creators: string[];
  cast: string[];
  people?: PersonCredit[];
};
export type Title = {
  id: string;
  format: string;
  anime: boolean;
  name: string;
  original: string;
  year: string;
  summary: string;
  poster: string | null;
  details?: TitleDetails | null;
};
