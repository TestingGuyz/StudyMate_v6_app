// Diagnostic baseline — exam-adapted subject selection, timed MCQs, pattern tracking, Neo4j persistence

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth, useLanguage } from '../../lib/context';
import { writeTransaction, readQuery } from '../../lib/neo4j';
import { v4 as uuidv4 } from 'uuid';
import { ScoreCircle } from '../../components/ScoreCircle';
import { callGroq, parseGroqJSON } from '../../lib/groq';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { getSubjectsForBoard } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { getExamProfile, getSubjectQuestionCounts, buildQuestionTypePrompt, ExamProfile } from '../../lib/examProfiles';

const PER_QUESTION_SEC = 75;

type QType = 'recall' | 'conceptual' | 'application';

interface DiagnosticQuestion {
  subject: string;
  chapter: string;
  question_type: QType;
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

type Phase = 'pick' | 'loading' | 'test' | 'feedback' | 'done';

interface AnswerRow {
  selected: string;
  correct: boolean;
  time_ms: number;
}

export default function BaselineTestScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const { language } = useLanguage();
  const params = useLocalSearchParams<{ 
    board?: string; classNum?: string; examId?: string;
    viewResults?: string 
  }>();

  const [phase, setPhase] = useState<Phase>(params.viewResults === 'true' ? 'loading' : 'pick');
  const [board, setBoard] = useState<'ICSE' | 'CBSE'>('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [selectAll, setSelectAll] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [weakSubjects, setWeakSubjects] = useState<string[]>([]);
  const [weakChapters, setWeakChapters] = useState<string[]>([]);
  const [weakPatterns, setWeakPatterns] = useState<string[]>([]);
  const [patternStats, setPatternStats] = useState<Record<string, {c:number;t:number}>>({});
  const [examProfile, setExamProfile] = useState<ExamProfile | null>(null);
  const [feedbackData, setFeedbackData] = useState<{ selected: string; correct: string; isCorrect: boolean; explanation: string; subject: string; chapter: string } | null>(null);

  const [timerLeft, setTimerLeft] = useState(PER_QUESTION_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireOnceRef = useRef(false);
  const questionStartMs = useRef(Date.now());
  const runStartedIso = useRef<string>(new Date().toISOString());
  const answersRef = useRef<AnswerRow[]>([]);
  const onPickRef = useRef<(opt: string) => void>(() => {});

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const p = await getStudentProfile(studentId);
      if (p) {
        setBoard(p.board as 'ICSE' | 'CBSE');
        setClassNum(p.class);
        const profile = getExamProfile(p.ambitions, p.board as 'ICSE' | 'CBSE');
        setExamProfile(profile);
        // Auto-select primary subjects from exam profile
        const autoSelect: Record<string, boolean> = {};
        for (const ps of profile.primarySubjects) {
          autoSelect[ps.subject] = true;
        }
        if (Object.keys(autoSelect).length > 0) setPicked(autoSelect);
      }

      // If viewResults mode, load last diagnostic results
      if (params.viewResults === 'true') {
        try {
          const recs = await readQuery(
            `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun)
             RETURN r.correct_total AS c, r.total_questions AS t,
                    r.ai_summary AS summary, r.weak_subjects_json AS ws,
                    r.weak_chapters_json AS wc, r.weak_patterns_json AS wp,
                    r.pattern_stats_json AS ps
             ORDER BY r.completed_at DESC LIMIT 1`,
            { studentId }
          );
          if (recs.length > 0) {
            const rec = recs[0];
            const c = Number(rec.get('c') || 0);
            const t = Number(rec.get('t') || 1);
            setScore(c);
            setQuestions(Array.from({ length: t }, () => ({} as any)));
            setAiSummary(rec.get('summary') || 'Your diagnostic results are shown below.');
            try { setWeakSubjects(JSON.parse(rec.get('ws') || '[]')); } catch {}
            try { setWeakChapters(JSON.parse(rec.get('wc') || '[]')); } catch {}
            try { setWeakPatterns(JSON.parse(rec.get('wp') || '[]')); } catch {}
            try { setPatternStats(JSON.parse(rec.get('ps') || '{}')); } catch {}
            setPhase('done');
          } else {
            setPhase('pick'); // No results found, show test setup
          }
        } catch {
          setPhase('pick');
        }
      }
    })();
  }, [studentId, params.viewResults]);

  const boardSubjects = getSubjectsForBoard(board);

  const toggleSubject = (name: string) => {
    setSelectAll(false);
    setPicked(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleSelectAll = () => {
    setSelectAll(prev => !prev);
    setPicked({});
  };

  const selectedList: string[] = selectAll
    ? boardSubjects.map(s => s.name)
    : Object.keys(picked).filter(k => picked[k]);

  const buildSyllabusHint = useCallback(() => {
    return selectedList
      .map(sub => {
        const ch = getChaptersForSubject(sub, board, classNum);
        return `${sub}: ${ch.slice(0, 10).join('; ')}`;
      })
      .join('\n');
  }, [selectedList, board, classNum]);

  const generateQuestions = async () => {
    if (!studentId || selectedList.length === 0) {
      Alert.alert('Pick subjects', 'Choose one or more subjects, or select All.');
      return;
    }
    setPhase('loading');
    setLoading(true);
    runStartedIso.current = new Date().toISOString();
    try {
      const totalQs = Math.min(24, Math.max(12, selectedList.length * 3));
      const syllabus = buildSyllabusHint();

      // Build exam-aware subject distribution
      let subjectDistribution = `Subjects to cover (distribute evenly): ${selectedList.join(', ')}.`;
      if (examProfile && examProfile.primarySubjects.length > 0) {
        const counts = getSubjectQuestionCounts(examProfile, totalQs, selectedList);
        const distLines = Object.entries(counts).map(([s, c]) => `${s}: ${c} questions`).join(', ');
        subjectDistribution = `Subject distribution (follow exactly): ${distLines}.`;
      }

      // Build exam-specific question type and style hints
      const qTypeHint = examProfile ? buildQuestionTypePrompt(examProfile) : '';
      const styleHint = examProfile?.questionStylePrompt || '';

      const prompt = `You are an assessment designer for ${board} Class ${classNum}${examProfile ? ` preparing students for ${examProfile.examName}` : ''}.
Create exactly ${totalQs} multiple-choice questions. 
CRITICAL: The questions, options, and explanations MUST be written in ${language}.
${subjectDistribution}
Each question must use question_type one of: recall, conceptual, application — vary across the paper.

${qTypeHint ? qTypeHint + '\n' : ''}${styleHint ? 'EXAM STYLE GUIDANCE:\n' + styleHint + '\n' : ''}
Syllabus hints (use chapter names exactly from this list when possible):
${syllabus}

Return ONLY valid JSON array (no markdown):
[{"subject":"Mathematics","chapter":"Quadratic Equations","question_type":"conceptual","question":"...","options":["","","",""],"correct":"must match one option exactly","explanation":"short"}]`;

      const raw = await callGroq(
        [
          { role: 'system', content: 'Return only JSON array. Questions must be fair for school level.' },
          { role: 'user', content: prompt },
        ],
        'diagnostic_generator'
      );

      let parsed: DiagnosticQuestion[];
      try {
        parsed = parseGroqJSON<DiagnosticQuestion[]>(raw);
      } catch {
        const retry = await callGroq(
          [{ role: 'system', content: 'Output ONLY a JSON array.' }, { role: 'user', content: prompt }],
          'diagnostic_generator'
        );
        parsed = parseGroqJSON<DiagnosticQuestion[]>(retry);
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Could not generate questions');
      }

      const cleaned: DiagnosticQuestion[] = parsed.map((q, i) => ({
        ...q,
        subject: q.subject || selectedList[i % selectedList.length],
        chapter: q.chapter || 'Mixed',
        question_type: (['recall', 'conceptual', 'application'] as const).includes(q.question_type as QType)
          ? (q.question_type as QType)
          : 'conceptual',
        options: Array.isArray(q.options) && q.options.length >= 4 ? q.options.slice(0, 4) : ['A', 'B', 'C', 'D'],
        correct: q.correct || q.options?.[0] || 'A',
        explanation: q.explanation || '',
      }));

      setQuestions(cleaned);
      setIdx(0);
      setScore(0);
      answersRef.current = [];
      questionStartMs.current = Date.now();
      setTimerLeft(PER_QUESTION_SEC);
      setPhase('test');
    } catch (e: unknown) {
      console.error(e);
      Alert.alert('Generation failed', e instanceof Error ? e.message : 'Try again');
      setPhase('pick');
    } finally {
      setLoading(false);
    }
  };

  const persistResults = useCallback(
    async (
      finalQuestions: DiagnosticQuestion[],
      finalAnswers: AnswerRow[],
      subjectsUsed: string[],
      summaryText: string,
      weakSubj: string[],
      weakChap: string[],
      weakPat: string[],
      patStats: Record<string, {c:number;t:number}>
    ) => {
      if (!studentId) return;

      const runId = uuidv4();
      const correctTot = finalAnswers.filter(a => a.correct).length;
      const queries: Array<{ cypher: string; params: Record<string, unknown> }> = [];

      queries.push({
        cypher: `
          MATCH (s:Student {id: $studentId})
          CREATE (run:DiagnosticRun {
            id: $runId,
            started_at: datetime($started_at),
            completed_at: datetime(),
            subjects_json: $subjects_json,
            per_question_sec: $pq,
            total_questions: $total,
            correct_total: $correct_total,
            ai_summary: $summary,
            weak_subjects_json: $weak_subj,
            weak_chapters_json: $weak_chap,
            board: $board,
            student_class: $student_class,
            weak_patterns_json: $weak_pat,
            pattern_stats_json: $pattern_stats,
            exam_profile: $exam_profile
          })
          CREATE (s)-[:TOOK_DIAGNOSTIC]->(run)
        `,
        params: {
          studentId,
          runId,
          started_at: runStartedIso.current,
          subjects_json: JSON.stringify(subjectsUsed),
          pq: PER_QUESTION_SEC,
          total: finalQuestions.length,
          correct_total: correctTot,
          summary: summaryText,
          weak_subj: JSON.stringify(weakSubj),
          weak_chap: JSON.stringify(weakChap),
          board,
          student_class: classNum,
          weak_pat: JSON.stringify(weakPat),
          pattern_stats: JSON.stringify(patStats),
          exam_profile: examProfile?.examName || 'Board Exam',
        },
      });

      for (let i = 0; i < finalQuestions.length; i++) {
        const q = finalQuestions[i];
        const a = finalAnswers[i];
        const aid = uuidv4();
        queries.push({
          cypher: `
            MATCH (run:DiagnosticRun {id: $runId})
            CREATE (att:DiagnosticAttempt {
              id: $aid,
              subject: $subject,
              chapter: $chapter,
              question_type: $qtype,
              question_text: $qtext,
              options_json: $options_json,
              correct_answer: $correct_answer,
              selected_answer: $selected_answer,
              is_correct: $is_correct,
              time_ms: $time_ms,
              explanation: $explanation
            })
            CREATE (run)-[:HAS_ATTEMPT]->(att)
          `,
          params: {
            runId,
            aid,
            subject: q.subject,
            chapter: q.chapter,
            qtype: q.question_type,
            qtext: q.question,
            options_json: JSON.stringify(q.options),
            correct_answer: q.correct,
            selected_answer: a.selected,
            is_correct: a.correct,
            time_ms: a.time_ms,
            explanation: q.explanation || '',
          },
        });
      }

      /* Aggregate quiz rows per subject for adaptive engine */
      const bySubject: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < finalQuestions.length; i++) {
        const sub = finalQuestions[i].subject;
        if (!bySubject[sub]) bySubject[sub] = { c: 0, t: 0 };
        bySubject[sub].t += 1;
        if (finalAnswers[i].correct) bySubject[sub].c += 1;
      }

      for (const [subject, { c, t }] of Object.entries(bySubject)) {
        const qid = uuidv4();
        queries.push({
          cypher: `
            MATCH (s:Student {id: $studentId})
            CREATE (qu:Quiz {
              id: $qid,
              subject: $subject,
              chapter: 'Diagnostic overview',
              score: $score,
              total: $total,
              date: datetime(),
              quiz_kind: 'diagnostic'
            })
            CREATE (s)-[:ATTEMPTED]->(qu)
          `,
          params: { studentId, qid, subject, score: c, total: t },
        });
      }

      await writeTransaction(queries);
    },
    [studentId, board, classNum, examProfile]
  );

  const finalize = useCallback(
    async (qList: DiagnosticQuestion[], ans: AnswerRow[]) => {
      const correctTot = ans.filter(a => a.correct).length;

      /* Weak chapters: >1 attempt and accuracy < 0.55 */
      const chapterStats: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < qList.length; i++) {
        const key = `${qList[i].subject} — ${qList[i].chapter}`;
        if (!chapterStats[key]) chapterStats[key] = { c: 0, t: 0 };
        chapterStats[key].t += 1;
        if (ans[i].correct) chapterStats[key].c += 1;
      }
      const weakChapList = Object.entries(chapterStats)
        .filter(([, v]) => v.t >= 1 && v.c / v.t < 0.55)
        .map(([k]) => k);

      const subStats: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < qList.length; i++) {
        const s = qList[i].subject;
        if (!subStats[s]) subStats[s] = { c: 0, t: 0 };
        subStats[s].t += 1;
        if (ans[i].correct) subStats[s].c += 1;
      }
      const weakSubjList = Object.entries(subStats)
        .filter(([, v]) => v.c / v.t < 0.6)
        .map(([k]) => k);

      setWeakSubjects(weakSubjList);
      setWeakChapters(weakChapList);

      // Pattern stats: accuracy per question_type
      const pStats: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < qList.length; i++) {
        const qt = qList[i].question_type || 'conceptual';
        if (!pStats[qt]) pStats[qt] = { c: 0, t: 0 };
        pStats[qt].t += 1;
        if (ans[i].correct) pStats[qt].c += 1;
      }
      const weakPatList = Object.entries(pStats)
        .filter(([, v]) => v.t >= 1 && v.c / v.t < 0.55)
        .map(([k]) => k);
      setWeakPatterns(weakPatList);
      setPatternStats(pStats);

      let summary =
        'Diagnostic complete. Focus extra practice on highlighted weak chapters in your dashboard.';
      try {
        const brief = qList
          .map(
            (q, i) =>
              `${i + 1}. ${q.subject} / ${q.chapter} / ${q.question_type}: ${ans[i].correct ? '✓' : '✗'} (${Math.round(ans[i].time_ms / 1000)}s)`
          )
          .join('\n');

        const patternSummary = Object.entries(pStats)
          .map(([k, v]) => `${k}: ${v.c}/${v.t} (${Math.round((v.c / v.t) * 100)}%)`)
          .join(', ');

        summary = await callGroq(
          [
            {
              role: 'system',
              content: `You are a coaching assistant. Using diagnostic MCQ results, name weak subjects/chapters AND weak question patterns (recall/conceptual/application) and tell the student how to rebalance study time. Max 120 words. Language: ${language}. Indian ${board} Class ${classNum}${examProfile ? ` (${examProfile.examName} prep)` : ''} context.`,
            },
            {
              role: 'user',
              content: `Score ${correctTot}/${qList.length}.\nWeak subjects: ${weakSubjList.join(', ')}\nWeak chapters: ${weakChapList.slice(0, 8).join('; ')}\nPattern accuracy: ${patternSummary}\nWeak patterns: ${weakPatList.join(', ') || 'none'}\nPer-question:\n${brief}`,
            },
          ],
          'baseline_analysis'
        );
      } catch (e) {
        console.warn('AI summary fallback', e);
      }

      setAiSummary(summary);

      await persistResults(qList, ans, selectedList, summary, weakSubjList, weakChapList, weakPatList, pStats);
      setPhase('done');
    },
    [persistResults, selectedList, board, classNum, examProfile, language]
  );

  const onPick = useCallback(
    (opt: string) => {
      const q = questions[idx];
      if (!q) return;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const elapsed = Date.now() - questionStartMs.current;
      const checkCorrect = (option: string, correct: string) => {
        if (!option || !correct) return false;
        const clean = (s: string) => s.toLowerCase().replace(/^[a-d][\s).:-]+/, '').trim();
        return clean(option) === clean(correct) || option === correct;
      };

      const isCorrect = opt !== '' && checkCorrect(opt, q.correct);
      const row: AnswerRow = { selected: opt, correct: isCorrect, time_ms: elapsed };
      answersRef.current[idx] = row;

      if (isCorrect) setScore(s => s + 1);

      // Show feedback before advancing
      setFeedbackData({
        selected: opt || '(timed out)',
        correct: q.correct,
        isCorrect,
        explanation: q.explanation || 'No explanation available.',
        subject: q.subject,
        chapter: q.chapter,
      });
      setPhase('feedback');
    },
    [questions, idx]
  );

  const advanceFromFeedback = useCallback(() => {
    setFeedbackData(null);
    if (idx >= questions.length - 1) {
      const ansArr = questions.map((_, i) => answersRef.current[i] ?? { selected: '', correct: false, time_ms: 0 });
      void finalize(questions, ansArr);
      return;
    }
    setIdx(i => i + 1);
    setPhase('test');
  }, [idx, questions, finalize]);

  // Keep ref in sync so timer closure always calls latest version
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    if (phase !== 'test' || questions.length === 0 || idx >= questions.length || !questions[idx]) return;

    expireOnceRef.current = false;
    questionStartMs.current = Date.now();
    setTimerLeft(PER_QUESTION_SEC);

    const id = setInterval(() => {
      setTimerLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          timerRef.current = null;
          if (!expireOnceRef.current) {
            expireOnceRef.current = true;
            setTimeout(() => onPickRef.current(''), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    timerRef.current = id;

    return () => {
      clearInterval(id);
      timerRef.current = null;
    };
  }, [phase, idx, questions]);

  /* --- Render --- */

  if (phase === 'done') {
    return (
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <ScoreCircle obtained={score} total={questions.length} size={120} />
        <Text style={[styles.title, { color: colors.text, marginTop: 24 }]}>Diagnostic results</Text>

        <View
          style={{
            backgroundColor: colors.surfaceContainer,
            padding: 20,
            borderRadius: 16,
            marginTop: 24,
            borderWidth: 1,
            borderColor: colors.border,
            width: '100%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
            <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: '700', color: colors.text }}>
              AI adaptation note
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, lineHeight: 24, fontSize: 15 }}>{aiSummary}</Text>
          {weakSubjects.length > 0 ? (
            <Text style={{ color: colors.text, marginTop: 14, fontWeight: '600' }}>
              Priority subjects: {weakSubjects.join(', ')}
            </Text>
          ) : null}
          {weakChapters.length > 0 ? (
            <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 13 }}>
              Chapters to strengthen: {weakChapters.slice(0, 6).join(' • ')}
              {weakChapters.length > 6 ? '…' : ''}
            </Text>
          ) : null}
        </View>

        {/* Pattern Breakdown Card */}
        {Object.keys(patternStats).length > 0 && (
          <View
            style={{
              backgroundColor: colors.surfaceContainer,
              padding: 20,
              borderRadius: 16,
              marginTop: 16,
              borderWidth: 1,
              borderColor: colors.border,
              width: '100%',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14 }}>
              Question Pattern Breakdown
            </Text>
            {Object.entries(patternStats).map(([type, { c, t }]) => {
              const pct = Math.round((c / t) * 100);
              const isWeak = pct < 55;
              return (
                <View key={type} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                  <Text style={{ width: 90, fontSize: 13, fontWeight: '600', color: colors.text, textTransform: 'capitalize' }}>{type}</Text>
                  <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: isWeak ? '#EF4444' : '#179C6E' }} />
                  </View>
                  <Text style={{ width: 50, textAlign: 'right', fontSize: 12, fontWeight: '600', color: isWeak ? '#EF4444' : '#179C6E' }}>{c}/{t}</Text>
                  {isWeak && (
                    <View style={{ backgroundColor: '#EF444418', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '600' }}>Weak</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {weakPatterns.length > 0 && (
              <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 13, fontStyle: 'italic' }}>
                Tip: Use Quiz → "Weak Patterns Only" to practice {weakPatterns.join(' & ')} questions
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, marginTop: 40, width: '100%' }]}
          onPress={() => router.back()}
        >
          <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: '600' }}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (phase === 'pick' || phase === 'loading') {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.pickContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Diagnostic setup</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={[styles.headline, { color: colors.text }]}>Choose subjects</Text>

        {examProfile && examProfile.primarySubjects.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: colors.primary + '12', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' }}>
            <Ionicons name="school-outline" size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
              Optimized for {examProfile.examName}
            </Text>
          </View>
        )}

        <Text style={[styles.help, { color: colors.textSecondary }]}>
          {examProfile && examProfile.primarySubjects.length > 0
            ? `Primary subjects for ${examProfile.examName} are pre-selected. You can still customize.`
            : 'The test includes only these subjects. Pick several, or All for every subject on your board.'}
        </Text>

        <TouchableOpacity
          style={[
            styles.allBtn,
            {
              backgroundColor: selectAll ? colors.primary : colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={toggleSelectAll}
        >
          <Text style={{ color: selectAll ? colors.onPrimary : colors.text, fontWeight: '700' }}>
            All subjects ({board})
          </Text>
        </TouchableOpacity>

        <View style={styles.grid}>
          {boardSubjects.map(s => {
            const on = !selectAll && !!picked[s.name];
            return (
              <TouchableOpacity
                key={s.name}
                style={[
                  styles.subPill,
                  {
                    backgroundColor: on ? colors.primary : colors.surface,
                    borderColor: on ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => toggleSubject(s.name)}
              >
                <Text style={{ color: on ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: '600' }}>
                  {s.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.timerNote, { color: colors.textTertiary }]}>
          {PER_QUESTION_SEC}s per question • Questions mix recall, conceptual, and application types
        </Text>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: selectedList.length ? colors.primary : colors.surfaceContainerHigh }]}
          onPress={() => void generateQuestions()}
          disabled={!selectedList.length || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={{ color: selectedList.length ? colors.onPrimary : colors.textTertiary, fontWeight: '700' }}>
              Generate & start test
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Feedback phase
  if (phase === 'feedback' && feedbackData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
          <View style={[styles.progressBarFill, { backgroundColor: colors.primary, width: `${((idx + 1) / Math.max(questions.length, 1)) * 100}%` }]} />
        </View>
        <View style={styles.header}>
          <View style={{ width: 24 }} />
          <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Q{idx + 1} Result</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{score}/{idx + 1}</Text>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { alignItems: 'center' }]}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: feedbackData.isCorrect ? '#05966920' : '#EF444420', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name={feedbackData.isCorrect ? 'checkmark-circle' : 'close-circle'} size={40} color={feedbackData.isCorrect ? '#059669' : '#EF4444'} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: feedbackData.isCorrect ? '#059669' : '#EF4444', marginBottom: 8 }}>
            {feedbackData.isCorrect ? 'Correct!' : 'Incorrect'}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 24 }}>
            {feedbackData.subject} • {feedbackData.chapter}
          </Text>
          {!feedbackData.isCorrect && (
            <View style={{ width: '100%', backgroundColor: '#EF444410', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#EF444425' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#EF4444', marginBottom: 4 }}>YOUR ANSWER</Text>
              <Text style={{ fontSize: 15, color: colors.text }}>{feedbackData.selected}</Text>
            </View>
          )}
          <View style={{ width: '100%', backgroundColor: '#05966910', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#05966925' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#059669', marginBottom: 4 }}>CORRECT ANSWER</Text>
            <Text style={{ fontSize: 15, color: colors.text }}>{feedbackData.correct}</Text>
          </View>
          <View style={{ width: '100%', backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, marginBottom: 6, letterSpacing: 0.5 }}>EXPLANATION</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}>{feedbackData.explanation}</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary, marginTop: 32, width: '100%' }]}
            onPress={advanceFromFeedback}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: '700' }}>
              {idx >= questions.length - 1 ? 'See Results' : 'Next Question'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const q = questions[idx];
  if (!q) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: colors.primary,
              width: `${(idx / Math.max(questions.length, 1)) * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Diagnostic</Text>
        <Text style={{ color: timerLeft <= 10 ? colors.error : colors.primary, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {timerLeft}s
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.meta, { color: colors.primary }]}>
          {q.subject.toUpperCase()} • {q.chapter} • {q.question_type}
        </Text>
        <Text style={[styles.question, { color: colors.text }]}>
          Q{idx + 1}/{questions.length}: {q.question}
        </Text>

        {q.options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => onPick(opt)}
          >
            <Text style={{ color: colors.text, fontSize: 16 }}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  pickContent: { padding: 20, paddingBottom: 48 },
  headline: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  help: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  allBtn: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 16,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  subPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  timerNote: { fontSize: 12, marginBottom: 20, textAlign: 'center' },
  progressBarBg: { height: 4, width: '100%' },
  progressBarFill: { height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  content: { padding: 20 },
  meta: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  question: { fontSize: 20, fontWeight: '600', marginBottom: 28, lineHeight: 28 },
  optionBtn: { padding: 18, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
});
