import type { Profile } from "../app/profile-form";

/** Tipos do painel pessoal (biblioteca, diário, comunidade) trocados entre o app e o BFF. */
export type Entry = {
  title: string;
  watched: boolean;
  interest: boolean;
  rewatching: boolean;
  rating: number | null;
  review: string | null;
  spoiler: boolean;
  version: number;
  hidden?: boolean;
  evaluation_public?: boolean;
  viewer_watched?: boolean;
  my_vote?: boolean | null;
};
export type Viewing = {
  id: string;
  title: string;
  watched_on: string | null;
  watched_at: string | null;
  rewatch: boolean;
};
export type PendingViewing = { title: string; name: string; watchedAt: string };
export const profileSections = ["watchlist", "ranking", "watched", "diary", "lists"] as const;
export type Section = (typeof profileSections)[number];
export type Dashboard = {
  visibility?: Record<Section, boolean>;
  ranking?: { title: string; tier: number }[];
  needsProfile?: boolean;
  profile?: Profile;
  library?: Entry[];
  diaryHasMore?: boolean;
  viewings?: Viewing[];
};
export type Review = {
  username: string;
  name: string;
  avatar?: string;
  rating: number | null;
  review: string;
  spoiler: boolean;
  version: number;
  my_vote: boolean | null;
  likes?: number;
  liked?: boolean;
  comments?: number;
};
export type RankedSeries = { title: string; tier: number; average: number };
export type SeasonProgress = {
  watched: number;
  total: number;
  average: number | null;
  rewatched: boolean;
  complete: boolean;
};
export type SeasonAverage = { season: number; average: number };
export type Community = {
  seasons?: SeasonAverage[];
  average: number | null;
  rating_count: number;
  episode_rating_count?: number;
  reviews: Review[];
};
export type DiaryResult = { items: Viewing[]; hasMore: boolean };
export type SpoilerState = { spoiler: boolean; my_vote?: boolean | null };
