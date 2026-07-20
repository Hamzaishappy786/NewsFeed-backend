import { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  RefreshControl,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { AIIntroCard } from "../../components/AIIntroCard";
import { FeedSection } from "../../components/FeedSection";
import { api } from "../../src/api";
import { C } from "../../src/colors";
import type { ApiDigest } from "../../src/types";

export default function TodayScreen() {
  const [digest, setDigest] = useState<ApiDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api.today();
      setDigest(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load digest.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={s.loadingText}>Loading today's digest…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorTitle}>Could not load</Text>
        <Text style={s.errorBody}>{error}</Text>
        <Text style={s.hint}>Hit /run on the Worker first to generate today's digest.</Text>
      </View>
    );
  }

  if (!digest) return null;

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={C.accent}
        />
      }
    >
      <View style={s.header}>
        <Text style={s.title}>Daily Digest</Text>
        <Text style={s.subtitle}>{digest.date} · {digest.total} stories</Text>
      </View>

      <AIIntroCard text={digest.aiIntro} />

      {digest.feeds.map((feed) => (
        <FeedSection key={feed.name} name={feed.name} articles={feed.articles} />
      ))}

      {digest.failures.length > 0 && (
        <View style={s.failureCard}>
          <Text style={s.failureTitle}>Skipped {digest.failures.length} feed{digest.failures.length === 1 ? "" : "s"}</Text>
          {digest.failures.map((f) => (
            <Text key={f.name} style={s.failureBody}>{f.name} — {f.reason}</Text>
          ))}
        </View>
      )}

      <Text style={s.footer}>Pull down to refresh · assembled at the edge</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: C.bg },
  header: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "700", color: C.heading },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 4 },
  loadingText: { marginTop: 12, color: C.muted, fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: "700", color: C.heading, marginBottom: 8 },
  errorBody: { fontSize: 14, color: C.muted, textAlign: "center", marginBottom: 12 },
  hint: { fontSize: 13, color: C.accent, textAlign: "center" },
  failureCard: {
    backgroundColor: C.warning,
    borderWidth: 1,
    borderColor: C.warningBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  failureTitle: { fontSize: 13, fontWeight: "700", color: C.warningText, marginBottom: 4 },
  failureBody: { fontSize: 12, color: C.warningText },
  footer: { fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 },
});
