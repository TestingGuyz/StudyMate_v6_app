// QUIZ SCREEN — Select subject, chapter, difficulty, count then generate
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth } from '../../lib/context';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';

export default function QuizScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [subject, setSubject] = useState<string | null>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [count, setCount] = useState(5);
  const [chapters, setChapters] = useState<string[]>([]);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [patternFilter, setPatternFilter] = useState<string>('all');
  const [detectedWeakPatterns, setDetectedWeakPatterns] = useState<string[]>([]);

  const PATTERN_OPTIONS = [
    { key: 'all', label: 'All', icon: 'grid-outline' as const },
    { key: 'weak', label: 'Weak', icon: 'alert-circle-outline' as const },
    { key: 'recall', label: 'Recall', icon: 'book-outline' as const },
    { key: 'conceptual', label: 'Conceptual', icon: 'bulb-outline' as const },
    { key: 'application', label: 'Application', icon: 'flask-outline' as const },
  ];

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
      <LinearGradient colors={isDark ? ['#1E1B4B', '#0F0E1A'] : ['#E0E7FF', '#F9F9FF']} style={st.hero}>
        <Text style={[st.title, { color: isDark ? '#FFF' : '#070235' }]}>Take a Quiz</Text>
        <Text style={[st.subtitle, { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(7,2,53,0.5)' }]}>Test your knowledge with AI-generated questions</Text>
      </LinearGradient>

      <View style={st.body}>
        <Text style={[st.label, { color: colors.textTertiary }]}>SELECT SUBJECT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          <View style={st.pillRow}>
            {SUBJECTS.map(s => (
              <TouchableOpacity key={s.name} style={[st.pill, { backgroundColor: subject === s.name ? colors.primary : colors.surface, borderColor: subject === s.name ? colors.primary : colors.border }]} onPress={() => setSubject(s.name)}>
                <Text style={[st.pillText, { color: subject === s.name ? colors.onPrimary : colors.text }]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {subject && (
          <>
            <Text style={[st.label, { color: colors.textTertiary }]}>TARGET CHAPTER</Text>
            <View style={[st.chapterList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <ScrollView style={{ maxHeight: 200 }}>
                {chapters.map(ch => (
                  <TouchableOpacity key={ch} style={[st.chapterItem, { backgroundColor: chapter === ch ? colors.primaryContainer : 'transparent', borderBottomColor: colors.border }]} onPress={() => setChapter(ch)}>
                    <Text style={[st.chapterText, { color: chapter === ch ? colors.onPrimaryContainer : colors.text }]}>{ch}</Text>
                    {chapter === ch && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        <Text style={[st.label, { color: colors.textTertiary }]}>DIFFICULTY</Text>
        <View style={st.diffRow}>
          {(['Easy', 'Medium', 'Hard'] as const).map(d => (
            <TouchableOpacity key={d} style={[st.diffPill, { backgroundColor: difficulty === d ? colors.primary : colors.surface, borderColor: difficulty === d ? colors.primary : colors.border }]} onPress={() => setDifficulty(d)}>
              <Text style={{ color: difficulty === d ? colors.onPrimary : colors.text, fontSize: 14, fontWeight: '600' }}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[st.label, { color: colors.textTertiary }]}>QUESTIONS</Text>
        <View style={st.diffRow}>
          {[5, 10, 15].map(n => (
            <TouchableOpacity key={n} style={[st.countPill, { backgroundColor: count === n ? colors.primary : colors.surface, borderColor: count === n ? colors.primary : colors.border }]} onPress={() => setCount(n)}>
              <Text style={{ color: count === n ? colors.onPrimary : colors.text, fontSize: 20, fontWeight: '700' }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[st.label, { color: colors.textTertiary }]}>PATTERN</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          <View style={st.pillRow}>
            {PATTERN_OPTIONS.map(p => {
              const isActive = patternFilter === p.key;
              const isDisabled = p.key === 'weak' && detectedWeakPatterns.length === 0;
              return (
                <TouchableOpacity key={p.key} disabled={isDisabled} style={[st.pill, { backgroundColor: isActive ? colors.primary : colors.surface, borderColor: isActive ? colors.primary : colors.border, opacity: isDisabled ? 0.4 : 1 }]} onPress={() => setPatternFilter(p.key)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={p.icon} size={14} color={isActive ? colors.onPrimary : colors.textSecondary} />
                    <Text style={[st.pillText, { color: isActive ? colors.onPrimary : colors.text }]}>{p.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <TouchableOpacity style={[st.startBtn, { backgroundColor: canStart ? colors.primary : colors.surfaceContainerHigh }]} onPress={handleStart} disabled={!canStart}>
          <Ionicons name="play" size={20} color={canStart ? colors.onPrimary : colors.textTertiary} />
          <Text style={{ color: canStart ? colors.onPrimary : colors.textTertiary, fontSize: 17, fontWeight: '700' }}>Start Quiz</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  hero: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 28, paddingHorizontal: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontWeight: '500' },
  body: { padding: 20 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10, marginTop: 20 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '500' },
  chapterList: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  chapterItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterText: { fontSize: 14, flex: 1 },
  diffRow: { flexDirection: 'row', gap: 10 },
  diffPill: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  countPill: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  startBtn: { marginTop: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 14 },
});
