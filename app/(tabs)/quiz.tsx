// QUIZ SCREEN — Premium quiz builder
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { ScreenHero, SectionLabel, PrimaryButton, usePremium } from '../../components/ui/premium';

export default function QuizScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();
  const premium = usePremium();
  const [subject, setSubject] = useState<string | null>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [count, setCount] = useState(5);
  const [chapters, setChapters] = useState<string[]>([]);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [patternFilter, setPatternFilter] = useState<string>('all');
  const [detectedWeakPatterns, setDetectedWeakPatterns] = useState<string[]>([]);

  const PATTERN_OPTIONS = useMemo(() => [
    { key: 'all', labelKey: 'pattern_all', icon: 'grid-outline' as const },
    { key: 'weak', labelKey: 'pattern_weak', icon: 'alert-circle-outline' as const },
    { key: 'recall', labelKey: 'pattern_recall', icon: 'book-outline' as const },
    { key: 'conceptual', labelKey: 'pattern_conceptual', icon: 'bulb-outline' as const },
    { key: 'application', labelKey: 'pattern_application', icon: 'flask-outline' as const },
  ], []);

  const DIFFICULTIES = useMemo(() => [
    { key: 'Easy' as const, labelKey: 'easy' },
    { key: 'Medium' as const, labelKey: 'medium' },
    { key: 'Hard' as const, labelKey: 'hard' },
  ], []);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
      try {
        const recs = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun)
           WHERE r.weak_patterns_json IS NOT NULL
           RETURN r.weak_patterns_json AS wp ORDER BY r.completed_at DESC LIMIT 1`,
          { studentId }
        );
        if (recs.length > 0) setDetectedWeakPatterns(JSON.parse(recs[0].get('wp') || '[]'));
      } catch {}
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) { setChapters(getChaptersForSubject(subject, board, classNum)); setChapter(null); }
  }, [subject, board, classNum]);

  const canStart = subject && chapter;
  const handleStart = () => {
    if (!canStart) return;
    router.push({
      pathname: '/screens/QuizPlayScreen',
      params: {
        subject: subject!, chapter: chapter!, difficulty, count: String(count), board, classNum: String(classNum),
        patternFilter: patternFilter === 'weak' ? detectedWeakPatterns.join(',') : patternFilter === 'all' ? '' : patternFilter,
      },
    });
  };

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      <ScreenHero title={tr('take_quiz')} subtitle={tr('quiz_sub')} />

      <View style={st.body}>
        <SectionLabel text={tr('select_subject')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={st.pillRow}>
            {SUBJECTS.map(s => (
              <TouchableOpacity
                key={s.name}
                activeOpacity={0.78}
                style={[st.pill, {
                  backgroundColor: subject === s.name ? colors.primary : premium.glassBg,
                  borderColor: subject === s.name ? colors.primary : premium.glassBorder,
                }]}
                onPress={() => setSubject(s.name)}
              >
                <Text style={[st.pillText, { color: subject === s.name ? colors.onPrimary : colors.text }]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {subject && (
          <>
            <SectionLabel text={tr('target_chapter')} />
            <View style={[st.chapterList, { borderColor: premium.glassBorder, backgroundColor: premium.glassBg }]}>
              <ScrollView style={{ maxHeight: 200 }}>
                {chapters.map(ch => (
                  <TouchableOpacity
                    key={ch}
                    activeOpacity={0.78}
                    style={[st.chapterItem, {
                      backgroundColor: chapter === ch ? colors.primaryContainer : 'transparent',
                      borderBottomColor: colors.border,
                    }]}
                    onPress={() => setChapter(ch)}
                  >
                    <Text style={[st.chapterText, { color: chapter === ch ? colors.onPrimaryContainer : colors.text }]}>{ch}</Text>
                    {chapter === ch && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        <SectionLabel text={tr('difficulty')} />
        <View style={st.diffRow}>
          {DIFFICULTIES.map(d => (
            <TouchableOpacity
              key={d.key}
              activeOpacity={0.78}
              style={[st.diffPill, {
                backgroundColor: difficulty === d.key ? colors.primary : premium.glassBg,
                borderColor: difficulty === d.key ? colors.primary : premium.glassBorder,
              }]}
              onPress={() => setDifficulty(d.key)}
            >
              <Text style={{ color: difficulty === d.key ? colors.onPrimary : colors.text, fontSize: 14, fontWeight: '600' }}>
                {tr(d.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionLabel text={tr('questions')} />
        <View style={st.diffRow}>
          {[5, 10, 15].map(n => (
            <TouchableOpacity
              key={n}
              activeOpacity={0.78}
              style={[st.countPill, {
                backgroundColor: count === n ? colors.primary : premium.glassBg,
                borderColor: count === n ? colors.primary : premium.glassBorder,
              }]}
              onPress={() => setCount(n)}
            >
              <Text style={{ color: count === n ? colors.onPrimary : colors.text, fontSize: 20, fontWeight: '700' }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionLabel text={tr('pattern')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={st.pillRow}>
            {PATTERN_OPTIONS.map(p => {
              const isActive = patternFilter === p.key;
              const isDisabled = p.key === 'weak' && detectedWeakPatterns.length === 0;
              return (
                <TouchableOpacity
                  key={p.key}
                  disabled={isDisabled}
                  activeOpacity={0.78}
                  style={[st.pill, {
                    backgroundColor: isActive ? colors.primary : premium.glassBg,
                    borderColor: isActive ? colors.primary : premium.glassBorder,
                    opacity: isDisabled ? 0.4 : 1,
                  }]}
                  onPress={() => setPatternFilter(p.key)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={p.icon} size={14} color={isActive ? colors.onPrimary : colors.textSecondary} />
                    <Text style={[st.pillText, { color: isActive ? colors.onPrimary : colors.text }]}>{tr(p.labelKey)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <PrimaryButton
          label={tr('start_quiz')}
          onPress={handleStart}
          disabled={!canStart}
          icon={<Ionicons name="play" size={20} color={isDark ? '#0F0E1A' : colors.onPrimary} />}
        />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  body: { padding: 16 },
  pillRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '600' },
  chapterList: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  chapterItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterText: { fontSize: 14, flex: 1 },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffPill: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  countPill: { width: 64, height: 64, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
