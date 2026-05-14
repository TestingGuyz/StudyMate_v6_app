// AI study schedule — template + behavioral context + Neo4j persistence

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callGroq } from '../../lib/groq';
import { v4 as uuidv4 } from 'uuid';
import { buildTimetablePromptBlock } from '../../lib/timetableTemplate';
import { readQuery, writeQuery } from '../../lib/neo4j';
import { searchStudyReferences, formatSnippetsForPrompt } from '../../lib/webSearch';
import { extractSlotsFromPlanMarkdown, replaceSlotsForWeek } from '../../lib/timetableSlots';
import { weekKeyFromDate } from '../../lib/weekUtils';
import { scheduleTimetableNudge } from '../../lib/notifications';
import { MarkdownView } from '../../components/MarkdownView';

function peakTimeToHour(peak: string): number {
  const m: Record<string, number> = {
    'Early Morning': 6,
    Morning: 9,
    Afternoon: 14,
    Evening: 18,
    'Late Night': 21,
    Night: 21,
  };
  return m[peak] ?? 18;
}

export default function StudyScheduleScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [schedule, setSchedule] = useState('');
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState<7 | 14 | 30>(14);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [dailyMins, setDailyMins] = useState(60);
  const [peakTime, setPeakTime] = useState('Evening');
  const [justGenerated, setJustGenerated] = useState(false);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) {
        setBoard(profile.board);
        setClassNum(profile.class);
        setDailyMins(profile.daily_study_mins);
        setPeakTime(profile.peak_study_time);
      }

      try {
        const recs = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:HAS_STUDY_PLAN]->(sp:StudyPlan)
           RETURN sp ORDER BY sp.created_at DESC LIMIT 1`,
          { studentId }
        );
        if (recs.length) {
          const sp = recs[0].get('sp').properties as { body?: string };
          if (sp.body) setSchedule(sp.body);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [studentId]);

  const generateSchedule = async () => {
    if (!studentId) return;
    setLoading(true);
    setSchedule('');
    try {
      const context = await buildStudentContext(studentId);
      const templateBlock = buildTimetablePromptBlock({
        daily_study_mins: dailyMins,
        peak_study_time: peakTime,
        board,
        class: classNum,
      });

      let refs = '';
      try {
        const snippets = await searchStudyReferences(
          `${board} class ${classNum} syllabus timetable study tips weak subjects`
        );
        refs = formatSnippetsForPrompt(snippets);
      } catch {
        refs = '';
      }

      const result = await callGroq(
        [
          {
            role: 'system',
            content: `You are a study planning expert for ${board} Class ${classNum}. ${context}

${templateBlock}

REFERENCE LINKS / SNIPPETS (optional grounding — cite names of chapters and books, never paste paywalled text):
${refs || '(no web results — rely on syllabus knowledge)'}`,
          },
          {
            role: 'user',
            content: `Generate a ${duration}-day study schedule for this student.

Rules:
1. Prioritize EMPIRICALLY_WEAK and AVOIDED_AND_WEAK subjects over strong subjects.
2. Use the timetable template table above; replace placeholders with concrete chapters from their syllabus.
3. Allocate minutes using roughly ${dailyMins} minutes/day on school days.
4. Put hardest cognitive work inside their peak window: ${peakTime}.
5. Every cell in the table must include: Subject + Chapter/Topic (e.g., "Physics: Optics Ch.10")
6. Leave most cells BLANK — students only study 2-4 hours/day.
7. End with a "## Weekly Focus" section with 3-5 bullet points on priority chapters.

Format STRICTLY using markdown: use # for headings, **bold** for emphasis, | for tables, - for bullet points.`,
          },
        ],
        'schedule_planner'
      );
      setSchedule(result);

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (sp:StudyPlan {
           id: $id,
           created_at: datetime(),
           duration_days: $duration_days,
           body: $body,
           template_version: 'weekly_table_v1'
         })
         CREATE (s)-[:HAS_STUDY_PLAN]->(sp)`,
        {
          studentId,
          id: uuidv4(),
          duration_days: duration,
          body: result,
        }
      );

      try {
        const extracted = await extractSlotsFromPlanMarkdown(result);
        if (extracted.length && studentId) {
          await replaceSlotsForWeek(studentId, weekKeyFromDate(), extracted);
          const incomplete = extracted.length;
          await scheduleTimetableNudge(peakTimeToHour(peakTime), 0, incomplete);
          setJustGenerated(true);
        }
      } catch (slotErr) {
        console.warn('Timetable slot extraction:', slotErr);
      }
    } catch (err: unknown) {
      setSchedule(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Study Schedule</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Uses your diagnostic strengths/weaknesses, daily time budget, and a fixed weekly template so plans stay consistent.
      </Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>PLAN DURATION</Text>
      <View style={styles.durRow}>
        {([7, 14, 30] as const).map(d => (
          <TouchableOpacity
            key={d}
            style={[
              styles.durPill,
              {
                backgroundColor: duration === d ? colors.primary : colors.surface,
                borderColor: duration === d ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setDuration(d)}
          >
            <Text style={[styles.durNum, { color: duration === d ? colors.onPrimary : colors.text }]}>{d}</Text>
            <Text style={[styles.durUnit, { color: duration === d ? colors.onPrimary : colors.textTertiary }]}>
              days
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.generateBtn, { backgroundColor: colors.primary }]}
        onPress={() => void generateSchedule()}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <>
            <Ionicons name="calendar" size={18} color={colors.onPrimary} />
            <Text style={[styles.generateText, { color: colors.onPrimary }]}>Generate & save plan</Text>
          </>
        )}
      </TouchableOpacity>

      {justGenerated && (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 12, marginTop: 16, backgroundColor: isDark ? '#05966920' : '#ECFDF5', borderWidth: 1, borderColor: '#05966940' }}
          onPress={() => router.back()}
        >
          <Ionicons name="checkmark-circle" size={22} color="#059669" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669' }}>Timetable saved! View in Dashboard</Text>
          <Ionicons name="arrow-forward" size={18} color="#059669" />
        </TouchableOpacity>
      )}

      {schedule ? (
        <View style={[styles.scheduleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.scheduleHeader}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.scheduleTitle, { color: colors.primary }]}>{duration}-Day Study Plan</Text>
          </View>
          <MarkdownView content={schedule} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 12 },
  durRow: { flexDirection: 'row', gap: 12 },
  durPill: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  durNum: { fontSize: 28, fontWeight: '700' },
  durUnit: { fontSize: 12, marginTop: 2 },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 28,
  },
  generateText: { fontSize: 15, fontWeight: '600' },
  scheduleCard: { borderRadius: 12, borderWidth: 1, padding: 20, marginTop: 20 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  scheduleTitle: { fontSize: 14, fontWeight: '600' },
  scheduleText: { fontSize: 14, lineHeight: 24 },
});
