import { View, Text, StyleSheet } from "react-native";
import { C } from "../src/colors";

export function AIIntroCard({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View style={s.card}>
      <Text style={s.label}>TODAY IN AI</Text>
      <Text style={s.body}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accentBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: C.accent,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: C.body,
  },
});
