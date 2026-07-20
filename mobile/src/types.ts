export interface ApiArticle {
  title: string;
  link: string;
  summary: string;
}

export interface ApiFeed {
  name: string;
  articles: ApiArticle[];
}

export interface ApiDigest {
  date: string;
  aiIntro: string;
  total: number;
  feeds: ApiFeed[];
  failures: { name: string; reason: string }[];
}

export interface ApiArchiveEntry {
  date: string;
  total: number;
  feeds: { name: string; articles: { title: string; link: string }[] }[];
}

export interface ApiStatus {
  paused: boolean;
  pausedUntil: string | null;
}
