import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { C } from "../src/colors";

interface Props {
  title: string;
  summary?: string;
  link: string;
  isLast?: boolean;
}

export function ArticleCard({ title, summary, link, isLast }: Props) {
  const open = () => WebBrowser.openBrowserAsync(link, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC });

  return (
    <TouchableOpacity onPress={open} activeOpacity={0.7}>
      <View style={[s.row, !isLast && s.border]}>
        <Text style={s.title} numberOfLines={3}>{title}</Text>
        {!!summary && <Text style={s.summary} numberOfLines={2}>{summary}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    paddingVertical: 12,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: C.heading,
    lineHeight: 21,
  },
  summary: {
    marginTop: 4,
    fontSize: 13,
    color: C.muted,
    lineHeight: 19,
  },
});
