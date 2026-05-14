// HOME DASHBOARD — Clean premium design with gradient header
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Platform, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth } from '../../lib/context';
import { getStudentProfile, StudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { computeStressVerdict } from '../../lib/stressDetection';
import { MoodCheckIn } from '../../components/MoodCheckIn';
import { AdaptiveNudgeCard } from '../../components/AdaptiveNudgeCard';
import { CrisisCard } from '../../components/CrisisCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { WeeklyTimetableCard } from '../../components/WeeklyTimetableCard';

const { width: SW } = Dimensions.get('window');
const DEFAULT_FOCUS_HINT = 'Short, focused sessions beat marathon cramming — pick one weak topic today.';

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMoodCheck, setShowMoodCheck] = useState(true);
  const [moodReaction, setMoodReaction] = useState('');
  const [isCrisis, setIsCrisis] = useState(false);
  const [hasBaseline, setHasBaseline] = useState(true);
  const [baselineViewed, setBaselineViewed] = useState(false);
  const [weekStats, setWeekStats] = useState({ quizzes: 0, avgScore: 0, studyMins: 0 });
  const [focusHint, setFocusHint] = useState(DEFAULT_FOCUS_HINT);
  const [nextExam, setNextExam] = useState<{ name: string; days: number } | null>(null);
  const [timetableReload, setTimetableReload] = useState(0);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    try {
      const p = await getStudentProfile(studentId);
      setProfile(p);

      const diagDone = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->() RETURN 1 LIMIT 1`,
        { studentId }
      );
      const legacyBaseline = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:TOOK_BASELINE]->() RETURN 1 LIMIT 1`,
        { studentId }
      );
      const baselineDone = diagDone.length > 0 || legacyBaseline.length > 0;
      setHasBaseline(baselineDone);

      // Check if user has viewed results at least once (stored as flag)
      if (baselineDone) {
        const viewedRec = await readQuery(
          `MATCH (s:Student {id: $studentId}) RETURN s.baseline_viewed AS v`,
          { studentId }
        );
        setBaselineViewed(viewedRec[0]?.get('v') === true);
      }

      const stressRow = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P7D')
         RETURN avg(toFloat(m.stress_level)) AS a`,
        { studentId }
      );
      const avgS = stressRow[0]?.get('a');
      if (avgS != null && !Number.isNaN(Number(avgS))) {
        const v = Number(avgS);
        if (v > 3.6) setFocusHint('Recent mood checks suggest higher strain — use shorter blocks and schedule breaks.');
        else if (v < 2.2) setFocusHint('You have been steady lately — a good stretch to tackle a weaker chapter.');
        else setFocusHint(DEFAULT_FOCUS_HINT);
      } else setFocusHint(DEFAULT_FOCUS_HINT);

      const examRec = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:HAS_EXAM]->(e:Exam)
         WHERE e.date > datetime()
         RETURN e.name AS name, e.date AS dt ORDER BY e.date ASC LIMIT 1`,
        { studentId }
      );
      if (examRec.length) {
        const rawName = examRec[0].get('name');
        const rawDt = examRec[0].get('dt');
        const name = typeof rawName === 'string' ? rawName : 'Exam';
        const examDate = rawDt ? new Date(String(rawDt)) : null;
        if (examDate && !Number.isNaN(examDate.getTime())) {
          const days = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
          setNextExam({ name, days });
        } else setNextExam(null);
      } else setNextExam(null);

      const moodToday = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P1D') RETURN m LIMIT 1`,
        { studentId }
      );
      setShowMoodCheck(moodToday.length === 0);

      const recentMoods = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P7D')
         RETURN m.stress_level AS stress_level, m.date AS date ORDER BY m.date DESC`,
        { studentId }
      );
      const quizzes = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
         WHERE q.date > datetime() - duration('P7D')
         RETURN count(q) AS count, avg(toFloat(q.score)/q.total) AS avg`,
        { studentId }
      );
      const sessions = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P7D')
         RETURN count(ss) AS count`,
        { studentId }
      );

      const moods = recentMoods.map(r => ({
        stress_level: r.get('stress_level') || 0,
        date: r.get('date')?.toString() || '',
      }));
      const sessionCount = sessions[0]?.get('count') || 0;
      const quizCount = quizzes[0]?.get('count') || 0;
      const avgScore = quizzes[0]?.get('avg') || 0;

      const verdict = computeStressVerdict({
        recentMoods: moods, activeSessions7Days: sessionCount,
        quizzesAttempted7Days: quizCount, avgQuizScoreStable: true,
      });
      setIsCrisis(verdict === 'CRISIS_RISK');

      const studySessions = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P7D')
         RETURN sum(ss.duration_mins) AS total`,
        { studentId }
      );
      setWeekStats({
        quizzes: quizCount,
        avgScore: Math.round(avgScore * 100) || 0,
        studyMins: studySessions[0]?.get('total') || 0,
      });
    } catch (err) {
      console.error('Home data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setTimetableReload(t => t + 1);
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleViewResults = async () => {
    // Mark as viewed so it won't show on dashboard again
    if (studentId) {
      try {
        const { writeQuery } = require('../../lib/neo4j');
        await writeQuery(`MATCH (s:Student {id: $studentId}) SET s.baseline_viewed = true`, { studentId });
      } catch {}
    }
    setBaselineViewed(true);
    router.push({ pathname: '/screens/BaselineTestScreen', params: { viewResults: 'true' } });
  };

  if (loading) return <ScreenSkeleton />;

  const FEATURES = [
    { icon: 'chatbubble-ellipses-outline', label: 'Ask AI', route: '/screens/AskAIScreen', color: '#818CF8' },
    { icon: 'document-text-outline', label: 'Grade Answer', route: '/screens/AnswerGraderScreen', color: '#60A5FA' },
    { icon: 'bulb-outline', label: 'Concepts', route: '/screens/ConceptExplainerScreen', color: '#FBBF24' },
    { icon: 'newspaper-outline', label: 'Mock Exam', route: '/screens/MockExamScreen', color: '#F472B6' },
    { icon: 'today-outline', label: 'Schedule', route: '/screens/StudyScheduleScreen', color: '#34D399' },
    { icon: 'calendar-outline', label: 'Calendar', route: '/screens/CalendarScreen', color: '#10B981' },
    { icon: 'albums-outline', label: 'Review Deck', route: '/screens/ReviewDeckScreen', color: '#FB923C' },
    { icon: 'people-outline', label: 'Parent View', route: '/screens/ParentPortalScreen', color: '#C084FC' },
    { icon: 'mic-outline', label: 'Voice AI', route: '/screens/VoiceModeScreen', color: '#38BDF8' },
    { icon: 'heart-outline', label: 'Wellness', route: '/screens/MoodHistoryScreen', color: '#F87171' },
    { icon: 'timer-outline', label: 'Focus Timer', route: '/screens/FocusTimerScreen', color: '#2DD4BF' },
    { icon: 'reader-outline', label: 'Notes', route: '/screens/StudyNotesScreen', color: '#A78BFA' },
  ];

  return (
    <ScrollView
      style={[st.container, { backgroundColor: colors.background }]}
      contentContainerStyle={st.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Hero Header */}
      <LinearGradient
        colors={isDark ? ['#1E1B4B', '#070235'] : ['#E0E7FF', '#F9F9FF']}
        style={st.hero}
      >
        <View style={[st.streakPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
          <Ionicons name="flame" size={14} color={isDark ? '#FEA619' : '#F59E0B'} />
          <Text style={[st.streakText, { color: isDark ? '#FFF' : '#000' }]}>{profile?.streak || 0}-DAY STREAK</Text>
        </View>
        <Text style={[st.greeting, { color: isDark ? '#FFF' : '#181445' }]}>
          {getGreeting()}, {profile?.name?.split(' ')[0] || 'Student'}
        </Text>
        <Text style={[st.greetingSub, { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(24,20,69,0.7)' }]}>
          {focusHint}
        </Text>
      </LinearGradient>

      {/* Stats Card */}
      <View style={{ marginTop: -20, paddingHorizontal: 16 }}>
        <View style={[st.statsRow, { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 10, borderRadius: 20, padding: 20 }]}>
          <View style={st.statCard}>
            <Text style={[st.statValue, { color: colors.text }]}>{Math.floor(weekStats.studyMins / 60)}<Text style={st.statUnit}>h </Text>{weekStats.studyMins % 60}<Text style={st.statUnit}>m</Text></Text>
            <Text style={[st.statLabel, { color: colors.textTertiary }]}>Time</Text>
          </View>
          <View style={[st.statDivider, { backgroundColor: colors.border }]} />
          <View style={st.statCard}>
            <Text style={[st.statValue, { color: colors.text }]}>{weekStats.avgScore}<Text style={st.statUnit}>%</Text></Text>
            <Text style={[st.statLabel, { color: colors.textTertiary }]}>Avg Score</Text>
          </View>
          <View style={[st.statDivider, { backgroundColor: colors.border }]} />
          <View style={st.statCard}>
            <Text style={[st.statValue, { color: colors.text }]}>{weekStats.quizzes}</Text>
            <Text style={[st.statLabel, { color: colors.textTertiary }]}>Quizzes</Text>
          </View>
        </View>
      </View>

      {/* Timetable */}
      {studentId ? <WeeklyTimetableCard studentId={studentId} reloadTick={timetableReload} /> : null}

      {/* Exam Banner */}
      {nextExam ? (
        <View style={{ marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: isDark ? 'rgba(254,166,25,0.35)' : '#FDE68A', backgroundColor: isDark ? 'rgba(254,166,25,0.08)' : '#FFFBEB' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#B45309', letterSpacing: 0.5 }}>UPCOMING EXAM</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#FFF' : '#181445', marginTop: 4 }}>{nextExam.name}</Text>
          <Text style={{ fontSize: 14, color: isDark ? 'rgba(255,255,255,0.75)' : '#92400E', marginTop: 4 }}>
            {nextExam.days === 0 ? 'Today — stay calm and trust your revision.' : `${nextExam.days} day${nextExam.days === 1 ? '' : 's'} left — bias time toward weak chapters.`}
          </Text>
        </View>
      ) : null}

      {/* Baseline — show only if not done, or done but not yet viewed */}
      {!hasBaseline && (
        <View style={{ padding: 20, margin: 16, backgroundColor: 'rgba(254,166,25,0.1)', borderRadius: 20, borderWidth: 1, borderColor: '#FEA619' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#B45309', marginBottom: 8 }}>Diagnostic recommended</Text>
          <Text style={{ color: '#B45309', marginBottom: 20 }}>Complete the timed diagnostic so weak subjects and chapters sync to your AI coach.</Text>
          <TouchableOpacity style={{ backgroundColor: '#F59E0B', padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={() => router.push('/screens/BaselineTestScreen')}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Take Baseline Test</Text>
          </TouchableOpacity>
        </View>
      )}
      {hasBaseline && !baselineViewed && (
        <View style={{ padding: 20, margin: 16, backgroundColor: isDark ? '#05966915' : '#ECFDF5', borderRadius: 20, borderWidth: 1, borderColor: '#05966940' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#059669', marginBottom: 8 }}>Diagnostic Complete ✓</Text>
          <Text style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#065F46', marginBottom: 16 }}>Your results are ready. View them to see your strengths and weaknesses.</Text>
          <TouchableOpacity style={{ backgroundColor: '#059669', padding: 14, borderRadius: 12, alignItems: 'center' }} onPress={handleViewResults}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>View Results</Text>
          </TouchableOpacity>
        </View>
      )}

      {isCrisis && <CrisisCard />}

      {/* Mood Check-in */}
      {showMoodCheck && !isCrisis && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <MoodCheckIn onComplete={(quote) => { setShowMoodCheck(false); setMoodReaction(quote); fetchData(); }} />
        </View>
      )}
      {moodReaction ? (
        <View style={{ padding: 20, marginHorizontal: 16, marginBottom: 8, backgroundColor: isDark ? 'rgba(196,193,251,0.1)' : '#EFF6FF', borderRadius: 16, borderWidth: 1, borderColor: isDark ? 'rgba(196,193,251,0.2)' : '#BFDBFE' }}>
          <Text style={{ fontSize: 15, color: isDark ? '#C4C1FB' : '#1D4ED8', fontStyle: 'italic', lineHeight: 22, textAlign: 'center' }}>"{moodReaction}"</Text>
        </View>
      ) : null}

      <AdaptiveNudgeCard />

      {/* Feature Grid */}
      <Text style={[st.sectionTitle, { color: colors.text, marginTop: 10 }]}>Explore Features</Text>
      <View style={st.actionGrid}>
        {FEATURES.map(action => (
          <TouchableOpacity
            key={action.label}
            style={[st.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(action.route as any)}
          >
            <View style={[st.actionIconWrap, { backgroundColor: action.color + '15' }]}>
              <Ionicons name={action.icon as any} size={24} color={action.color} />
            </View>
            <Text style={[st.actionLabel, { color: colors.text }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 50 },
  hero: { padding: 24, paddingTop: Platform.OS === 'ios' ? 70 : 50, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 40 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 16 },
  streakText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  greeting: { fontSize: 32, fontWeight: '800', marginBottom: 10, letterSpacing: -1 },
  greetingSub: { fontSize: 14, lineHeight: 22, maxWidth: '90%' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statCard: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: 40 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statUnit: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 14 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  actionCard: {
    width: SW > 400 ? '31%' : '47%', paddingVertical: 20, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 10,
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
  },
  actionIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
