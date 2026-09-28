import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "./ThemeContext";

interface Props {
  progress: number;
  label?: string;
  sublabel?: string;
}

export function ProgressBar({ progress, label, sublabel }: Props) {
  const { colors } = useTheme();
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>}
      <View style={[styles.track, { backgroundColor: colors.line }]}>
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: colors.accent }]} />
      </View>
      <View style={styles.footerRow}>
        <Text style={[styles.percent, { color: colors.accent }]}>{Math.round(clamped)}%</Text>
        {!!sublabel && <Text style={[styles.sublabel, { color: colors.muted }]}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 4 },
  label: { fontSize: 12, marginBottom: 4 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  percent: { fontSize: 11, fontWeight: "600" },
  sublabel: { fontSize: 11, flex: 1, textAlign: "right", marginLeft: 8 },
});
