import { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ArticleCard } from "../../components/ArticleCard";
import { api } from "../../src/api";
import { C } from "../../src/colors";
import type { ApiArchiveEntry } from "../../src/types";

export default function ArchiveDayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [entry, setEntry] = useState<ApiArchiveEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    api.archiveDay(date)
      .then(setEntry)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (error || !entry) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{error ?? "Issue not found."}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.title}>Daily Digest</Text>
        <Text style={s.subtitle}>{entry.date} · {entry.total} stories</Text>
      </View>

      {entry.feeds.map((feed) => (
        <View key={feed.name} style={s.card}>
          <Text style={s.source}>{feed.name.toUpperCase()}</Text>
          {feed.articles.map((a, i) => (
            <ArticleCard
              key={a.link}
              title={a.title}
              link={a.link}
              isLast={i === feed.articles.length - 1}
            />
          ))}
        </View>
      ))}

      <Text style={s.footer}>Archived issue · {entry.date}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  header: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "700", color: C.heading },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 4 },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    marginBottom: 12,
  },
  source: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: C.accent, marginBottom: 4 },
  errorText: { fontSize: 15, color: C.muted },
  footer: { fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 },
});
