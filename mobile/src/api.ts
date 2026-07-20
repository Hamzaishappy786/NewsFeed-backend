import type { ApiDigest, ApiArchiveEntry, ApiStatus } from "./types";

export const BASE_URL = "https://daily-rss-digest.hamzaonly.workers.dev";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  today: () => get<ApiDigest>("/api/today"),
  archiveIndex: () => get<{ issues: string[] }>("/api/archive"),
  archiveDay: (date: string) => get<ApiArchiveEntry>(`/api/archive/${date}`),
  status: () => get<ApiStatus>("/api/status"),
  run: () => get<{ message: string }>("/api/run"),
  pause: (days = 7) => get<{ message: string; until: string }>(`/api/pause?days=${days}`),
  unpause: () => get<{ message: string }>("/api/unpause"),
  weekly: () => get<{ message: string }>("/api/weekly"),
};
