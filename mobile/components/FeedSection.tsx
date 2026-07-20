import { View, Text, StyleSheet } from "react-native";
import { ArticleCard } from "./ArticleCard";
import { C } from "../src/colors";

interface Article {
  title: string;
  link: string;
  summary?: string;
}

interface Props {
  name: string;
  articles: Article[];
}

export function FeedSection({ name, articles }: Props) {
  if (!articles.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.source}>{name.toUpperCase()}</Text>
      {articles.map((a, i) => (
        <ArticleCard
          key={a.link}
          title={a.title}
          summary={a.summary}
          link={a.link}
          isLast={i === articles.length - 1}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
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
  source: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: C.accent,
    marginBottom: 4,
  },
});
