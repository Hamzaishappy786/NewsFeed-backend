import { useEffect, useState, useCallback } from "react";
import {
  FlatList,
  RefreshControl,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { C } from "../../src/colors";

export default function ArchiveScreen() {
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.archiveIndex();
      setIssues(data.issues);
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
      </View>
    );
  }

  if (!issues.length) {
    return (
      <View style={s.center}>
        <Text style={s.empty}>No past issues yet.</Text>
        <Text style={s.hint}>Digest saves here automatically after each run.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={s.content}
      data={issues}
      keyExtractor={(d) => d}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.accent} />
      }
      renderItem={({ item: date }) => (
        <TouchableOpacity
          style={s.row}
          activeOpacity={0.7}
          onPress={() => router.push(`/archive/${date}`)}
        >
          <View>
            <Text style={s.date}>{date}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={s.sep} />}
    />
  );
}

const s = StyleSheet.create({
  list: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, padding: 32 },
  empty: { fontSize: 16, fontWeight: "600", color: C.heading, marginBottom: 8 },
  hint: { fontSize: 13, color: C.muted, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  date: { fontSize: 15, fontWeight: "600", color: C.heading },
  sep: { height: 8 },
});
