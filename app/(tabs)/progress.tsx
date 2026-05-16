// PROGRESS DASHBOARD — Premium analytics
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { shouldShowBurnoutAlert } from '../../lib/stressDetection';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import { CrisisCard } from '../../components/CrisisCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { SubjectColors } from '../../constants/colors';
import { ScreenHero, GlassCard, usePremium } from '../../components/ui/premium';

export default function ProgressScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();
  const premium = usePremium();
  const [loading, setLoading] = useState(true);
  const [studyMins, setStudyMins] = useState(0);
  const [totalQuizzes, setTotalQuizzes] = useState(0);
  const [states, setStates] = useState<SubjectState[]>([]);
  const [moodData, setMoodData] = useState<Array<{ stress: number; day: string }>>([]);
  const [showBurnout, setShowBurnout] = useState(false);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [answerHistory, setAnswerHistory] = useState<any[]>([]);
  const [gStats, setGStats] = useState<GamificationStats | null>(null);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try {
        const [subStates, studyR, quizR, moodR, quizHistR, ansHistR] = await Promise.all([
          getSubjectStates(studentId),
          readQuery(`MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession) WHERE ss.date > datetime() - duration('P7D') RETURN sum(ss.duration_mins) AS total`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz) RETURN count(q) AS count`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog) WHERE m.date > datetime() - duration('P7D') RETURN m.stress_level AS stress, m.date AS date ORDER BY m.date ASC`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz) RETURN q.date AS date, q.subject AS subject, q.chapter AS chapter, q.score AS score, q.total AS total ORDER BY q.date DESC LIMIT 20`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:SUBMITTED]->(a:AnswerSubmission) RETURN a.date AS date, a.subject AS subject, a.marks_obtained AS obtained, a.marks_max AS max ORDER BY a.date DESC LIMIT 10`, { studentId }),
        ]);
        setStates(subStates);
        setStudyMins(studyR[0]?.get('total') || 0);
        setTotalQuizzes(quizR[0]?.get('count') || 0);
        setMoodData(moodR.map(r => ({ stress: r.get('stress') || 0, day: new Date(r.get('date')?.toString() || '').toLocaleDateString('en', { weekday: 'short' }) })));
        setShowBurnout(shouldShowBurnoutAlert(moodR.map(r => ({ stress_level: r.get('stress') || 0, date: r.get('date')?.toString() || '' }))));
        setQuizHistory(quizHistR.map(r => ({ date: new Date(r.get('date')?.toString() || '').toLocaleDateString(), subject: r.get('subject'), chapter: r.get('chapter'), score: r.get('score'), total: r.get('total') })));
        setAnswerHistory(ansHistR.map(r => ({ date: new Date(r.get('date')?.toString() || '').toLocaleDateString(), subject: r.get('subject'), obtained: r.get('obtained'), max: r.get('max') })));
        setGStats(await getGamificationStats(studentId));
      } catch (err) { console.error('Progress fetch error:', err); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  if (loading) return <ScreenSkeleton />;

  const statTiles = [
    { icon: 'flame-outline', value: `${gStats?.streak || 0}`, label: tr('streak') },
    { icon: 'star-outline', value: `${tr('level')} ${gStats?.level || 1}`, label: `${gStats?.xp || 0} ${tr('xp')}` },
    { icon: 'time-outline', value: `${Math.floor(studyMins / 60)}h ${studyMins % 60}m`, label: tr('this_week') },
    { icon: 'checkmark-done-outline', value: `${totalQuizzes}`, label: tr('stat_quizzes') },
  ];

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      <ScreenHero title={tr('progress_title')}>
        <View style={st.statsRow}>
          {statTiles.map(s => (
            <View key={s.label} style={[st.stat, { backgroundColor: premium.glassBg, borderColor: premium.glassBorder, borderWidth: 1 }]}>
              <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={14} color={isDark ? '#C4C1FB' : colors.primary} />
              <Text style={[st.statValue, { color: colors.text }]}>{s.value}</Text>
              <Text style={[st.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </ScreenHero>

      <View style={st.body}>
        {showBurnout && <CrisisCard />}

        {moodData.length > 0 && (
          <GlassCard>
            <Text style={[st.cardTitle, { color: colors.text }]}>{tr('mood_7d')}</Text>
            <View style={st.moodChart}>
              {moodData.map((m, i) => {
                const height = Math.max((m.stress / 5) * 60, 8);
                const barColor = m.stress <= 2 ? '#059669' : m.stress === 3 ? '#F59E0B' : '#EF4444';
                return (
                  <View key={i} style={st.moodBar}>
                    <View style={[st.moodBarFill, { height, backgroundColor: barColor }]} />
                    <Text style={[st.moodLabel, { color: colors.textTertiary }]}>{m.day}</Text>
                  </View>
                );
              })}
            </View>
          </GlassCard>
        )}

        <GlassCard>
          <Text style={[st.cardTitle, { color: colors.text }]}>{tr('subject_performance')}</Text>
          {states.map(s => {
            const barWidth = `${Math.max(s.weighted_avg, 5)}%`;
            const subColor = isDark ? SubjectColors[s.subject]?.dark || colors.primary : SubjectColors[s.subject]?.light || colors.primary;
            const isWeak = s.state === 'EMPIRICALLY_WEAK' || s.state === 'AVOIDED_AND_WEAK';
            return (
              <View key={s.subject} style={st.perfRow}>
                <Text style={[st.perfSubject, { color: colors.text }]} numberOfLines={1}>{s.subject}</Text>
                <View style={[st.perfBarBg, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <View style={[st.perfBar, { width: barWidth as `${number}%`, backgroundColor: subColor }]} />
                </View>
                <Text style={[st.perfPct, { color: colors.textSecondary }]}>{s.weighted_avg}%</Text>
                {isWeak && (
                  <View style={st.weakBadge}>
                    <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '700' }}>{tr('weak')}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </GlassCard>

        {quizHistory.length > 0 && (
          <GlassCard>
            <Text style={[st.cardTitle, { color: colors.text }]}>{tr('quiz_history')}</Text>
            {quizHistory.map((q, i) => (
              <View key={i} style={[st.histRow, { borderBottomColor: colors.border }]}>
                <Text style={[st.histDate, { color: colors.textTertiary }]}>{q.date}</Text>
                <Text style={[st.histSubject, { color: colors.text }]} numberOfLines={1}>{q.subject}</Text>
                <Text style={[st.histScore, { color: colors.text }]}>{q.score}/{q.total}</Text>
              </View>
            ))}
          </GlassCard>
        )}

        {answerHistory.length > 0 && (
          <GlassCard>
            <Text style={[st.cardTitle, { color: colors.text }]}>{tr('answer_history')}</Text>
            {answerHistory.map((a, i) => (
              <View key={i} style={[st.histRow, { borderBottomColor: colors.border }]}>
                <Text style={[st.histDate, { color: colors.textTertiary }]}>{a.date}</Text>
                <Text style={[st.histSubject, { color: colors.text }]} numberOfLines={1}>{a.subject}</Text>
                <Text style={[st.histScore, { color: colors.text }]}>{a.obtained}/{a.max}</Text>
              </View>
            ))}
          </GlassCard>
        )}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  stat: { flex: 1, minWidth: '46%', padding: 12, borderRadius: 12, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  body: { padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, letterSpacing: -0.2 },
  moodChart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 80 },
  moodBar: { alignItems: 'center', gap: 4 },
  moodBarFill: { width: 24, borderRadius: 6 },
  moodLabel: { fontSize: 10, fontWeight: '500' },
  perfRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  perfSubject: { width: 90, fontSize: 13, fontWeight: '600' },
  perfBarBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  perfBar: { height: 8, borderRadius: 4 },
  perfPct: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  weakBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#EF444418' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  histDate: { width: 70, fontSize: 11, fontWeight: '500' },
  histSubject: { flex: 1, fontSize: 13 },
  histScore: { fontSize: 14, fontWeight: '700' },
});
