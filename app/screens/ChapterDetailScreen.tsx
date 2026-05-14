// CHAPTER DETAIL SCREEN — Chapter list for a subject + actions

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { getChaptersForSubject } from '../../constants/chapters';
import { SubjectColors, PerformanceDotColors } from '../../constants/colors';

export default function ChapterDetailScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const params = useLocalSearchParams<{ subject: string }>();
  const subject = params.subject || 'Physics';
  const [chapters, setChapters] = useState<string[]>([]);
  const [chapterPerf, setChapterPerf] = useState<Record<string, { avg: number; lastStudied: string }>>({});

  const subjectColor = isDark
    ? SubjectColors[subject]?.dark || colors.primary
    : SubjectColors[subject]?.light || colors.primary;

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (!profile) return;
      const ch = getChaptersForSubject(subject, profile.board, profile.class);
      setChapters(ch);

      // Get chapter performance
      const perf = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
         WHERE q.subject = $subject
         WITH q.chapter AS chapter, avg(toFloat(q.score)/q.total) AS avg, max(q.date) AS last
         RETURN chapter, avg, last`,
        { studentId, subject }
      );
      const perfMap: Record<string, { avg: number; lastStudied: string }> = {};
      for (const r of perf) {
        perfMap[r.get('chapter')] = {
          avg: r.get('avg') || 0,
          lastStudied: r.get('last')?.toString() || '',
        };
      }
      setChapterPerf(perfMap);
    })();
  }, [studentId, subject]);

  const getDotColor = (chapterName: string) => {
    const perf = chapterPerf[chapterName];
    if (!perf) return PerformanceDotColors.unattempted;
    if (perf.avg >= 0.75) return PerformanceDotColors.excellent;
    if (perf.avg >= 0.50) return PerformanceDotColors.good;
    return PerformanceDotColors.weak;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.colorPip, { backgroundColor: subjectColor }]} />
          <Text style={[styles.title, { color: colors.text }]}>{subject}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        {[
          { icon: 'chatbubble-ellipses-outline', label: 'Ask Doubt', screen: '/screens/AskAIScreen' },
          { icon: 'help-circle-outline', label: 'Quiz', screen: '/(tabs)/quiz' },
          { icon: 'reader-outline', label: 'Notes', screen: '/screens/StudyNotesScreen' },
        ].map(a => (
          <TouchableOpacity
            key={a.label}
            style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(a.screen as any)}
          >
            <Ionicons name={a.icon as any} size={22} color={subjectColor} />
            <Text style={[styles.actionLabel, { color: colors.text }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chapter list */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Chapters</Text>
      {chapters.map((ch, i) => {
        const dotColor = getDotColor(ch);
        const perf = chapterPerf[ch];
        return (
          <TouchableOpacity
            key={i}
            style={[styles.chapterRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push({
              pathname: '/screens/StudyNotesScreen',
              params: { subject, chapter: ch },
            })}
          >
            <View style={[styles.perfDot, { backgroundColor: dotColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.chapterName, { color: colors.text }]}>{ch}</Text>
              {perf?.lastStudied && (
                <Text style={[styles.chapterDate, { color: colors.textTertiary }]}>
                  Last studied: {new Date(perf.lastStudied).toLocaleDateString()}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorPip: { width: 4, height: 24, borderRadius: 2 },
  title: { fontSize: 22, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionCard: {
    flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 6,
  },
  actionLabel: { fontSize: 12, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  chapterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  perfDot: { width: 10, height: 10, borderRadius: 5 },
  chapterName: { fontSize: 14, fontWeight: '500' },
  chapterDate: { fontSize: 11, marginTop: 2 },
});
