import { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { api } from "../../src/api";
import { C } from "../../src/colors";
import type { ApiStatus } from "../../src/types";

function SettingButton({
  label,
  sublabel,
  onPress,
  color = C.heading,
  loading = false,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  color?: string;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity style={s.btn} onPress={onPress} activeOpacity={0.7} disabled={loading}>
      <View style={s.btnText}>
        <Text style={[s.btnLabel, { color }]}>{label}</Text>
        {!!sublabel && <Text style={s.btnSub}>{sublabel}</Text>}
      </View>
      {loading && <ActivityIndicator size="small" color={C.muted} />}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch {}
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function run(key: string, action: () => Promise<{ message: string }>, msg?: string) {
    setBusyKey(key);
    try {
      const res = await action();
      Alert.alert("Done", msg ?? res.message);
      await loadStatus();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  const pauseUntilLabel = status?.pausedUntil
    ? new Date(status.pausedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <Text style={s.sectionTitle}>DIGEST</Text>
      <View style={s.group}>
        <SettingButton
          label="Send now"
          sublabel="Fetch all feeds and send the email"
          onPress={() => run("run", api.run, "Digest sent! Check your email.")}
          loading={busyKey === "run"}
        />
        <View style={s.sep} />
        <SettingButton
          label="Send weekly recap"
          sublabel="Top stories from the last 7 days"
          onPress={() => run("weekly", api.weekly, "Weekly recap sent!")}
          loading={busyKey === "weekly"}
        />
      </View>

      <Text style={s.sectionTitle}>PAUSE</Text>
      <View style={s.group}>
        {status?.paused ? (
          <>
            <View style={s.pausedBanner}>
              <Text style={s.pausedText}>
                Paused until {pauseUntilLabel ?? "unknown"}
              </Text>
            </View>
            <View style={s.sep} />
            <SettingButton
              label="Unpause"
              sublabel="Resume daily emails immediately"
              onPress={() => run("unpause", api.unpause)}
              loading={busyKey === "unpause"}
              color={C.accent}
            />
          </>
        ) : (
          <>
            <SettingButton
              label="Pause for 7 days"
              sublabel="No emails until next week"
              onPress={() =>
                Alert.alert("Pause digest?", "You won't receive emails for 7 days.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Pause", style: "destructive", onPress: () => run("pause7", () => api.pause(7)) },
                ])
              }
              loading={busyKey === "pause7"}
              color={C.danger}
            />
            <View style={s.sep} />
            <SettingButton
              label="Pause for 30 days"
              sublabel="No emails for a month"
              onPress={() =>
                Alert.alert("Pause digest?", "You won't receive emails for 30 days.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Pause", style: "destructive", onPress: () => run("pause30", () => api.pause(30)) },
                ])
              }
              loading={busyKey === "pause30"}
              color={C.danger}
            />
          </>
        )}
      </View>

      <Text style={s.sectionTitle}>SCHEDULE</Text>
      <View style={s.group}>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Daily digest</Text>
          <Text style={s.infoValue}>09:00 PKT (Mon–Sat)</Text>
        </View>
        <View style={s.sep} />
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Weekly recap</Text>
          <Text style={s.infoValue}>09:00 PKT (Sunday)</Text>
        </View>
        <View style={s.sep} />
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Feeds</Text>
          <Text style={s.infoValue}>6 sources</Text>
        </View>
      </View>

      <Text style={s.footer}>Running on Cloudflare Workers · $0/month</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: C.muted,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  group: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  btnText: { flex: 1 },
  btnLabel: { fontSize: 15, fontWeight: "600" },
  btnSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  sep: { height: 1, backgroundColor: C.border, marginLeft: 16 },
  pausedBanner: {
    backgroundColor: C.accentBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pausedText: { fontSize: 14, color: C.accent, fontWeight: "600" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  infoLabel: { fontSize: 15, color: C.heading },
  infoValue: { fontSize: 14, color: C.muted },
  footer: { fontSize: 11, color: C.muted, textAlign: "center", marginTop: 24 },
});
