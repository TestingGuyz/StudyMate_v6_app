// QUIZ PLAY SCREEN — MCQ quiz with timer, explanations, and results

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext } from '../../lib/adaptiveEngine';
import { callGroq, parseGroqJSON } from '../../lib/groq';
import { writeQuery } from '../../lib/neo4j';
import { searchStudyReferences, formatSnippetsForPrompt } from '../../lib/webSearch';
import { ScoreCircle } from '../../components/ScoreCircle';
import { v4 as uuidv4 } from 'uuid';

interface QuizQuestion {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

export default function QuizPlayScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const params = useLocalSearchParams<{
    subject: string; chapter: string; difficulty: string;
    count: string; board: string; classNum: string;
    patternFilter?: string;
  }>();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(30);
  const [totalTime, setTotalTime] = useState(0);
  const [finished, setFinished] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState<Array<{ q: QuizQuestion; selected: string }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate quiz
  useEffect(() => {
    generateQuiz();
  }, []);

  // Timer
  useEffect(() => {
    if (!loading && !finished && !answered) {
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            handleSelect(''); // Time's up
            return 30;
          }
          return prev - 1;
        });
        setTotalTime(prev => prev + 1);
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading, finished, answered, current]);

  const generateQuiz = async () => {
    setLoading(true);
    setError('');
    try {
      const context = studentId ? await buildStudentContext(studentId) : '';
      let refBlock = '';
      try {
        const snippets = await searchStudyReferences(
          `${params.board} class ${params.classNum} ${params.subject} ${params.chapter} textbook ICSE CBSE ML Aggarwal Concise Selina`
        );
        refBlock = formatSnippetsForPrompt(snippets).slice(0, 3500);
      } catch {
        refBlock = '';
      }
      // Build pattern constraint if set
      let patternHint = '';
      if (params.patternFilter) {
        const patterns = params.patternFilter.split(',').filter(Boolean);
        if (patterns.length === 1) {
          patternHint = `\nQuestion type focus: Generate ONLY ${patterns[0]} type questions (${patterns[0] === 'recall' ? 'testing direct factual memory' : patterns[0] === 'conceptual' ? 'testing understanding of concepts and why things work' : 'testing ability to apply concepts to new situations'}).`;
        } else if (patterns.length > 1) {
          patternHint = `\nQuestion type focus: Generate 70% ${patterns.join(' and ')} type questions and 30% other types. The student is weak in these patterns.`;
        }
      }

      const prompt = `${context}

SYLLABUS / BOOK REFERENCES (titles only — align questions; do not copy long excerpts):
${refBlock || '(none)'}

Generate ${params.count || 5} MCQ questions for ${params.board} Class ${params.classNum} on ${params.chapter} in ${params.subject}.
Difficulty: ${params.difficulty || 'Medium'}.${patternHint}

Return ONLY a valid JSON array. No markdown. No extra text. Just the array:
[{"question":"string","options":["a","b","c","d"],"correct":"string","explanation":"string"}]`;

      const response = await callGroq(
        [{ role: 'system', content: 'You are a quiz generator. Return only valid JSON.' }, { role: 'user', content: prompt }],
        'quiz_generator'
      );

      let parsed: QuizQuestion[];
      try {
        parsed = parseGroqJSON<QuizQuestion[]>(response);
      } catch {
        // Retry with cleaner prompt
        const retry = await callGroq(
          [{ role: 'system', content: 'Return ONLY a JSON array of quiz questions. No other text.' }, { role: 'user', content: prompt }],
          'quiz_generator'
        );
        parsed = parseGroqJSON<QuizQuestion[]>(retry);
      }

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Invalid quiz data');
      setQuestions(parsed);
    } catch (err: any) {
      setError(err.message || 'Failed to generate quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (option: string) => {
    if (answered) return;
    setSelected(option);
    setAnswered(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const isCorrect = option === questions[current]?.correct;
    if (isCorrect) setScore(prev => prev + 1);
    else if (option) {
      setWrongAnswers(prev => [...prev, { q: questions[current], selected: option }]);
    }
  };

  const handleNext = () => {
    if (current >= questions.length - 1) {
      finishQuiz();
      return;
    }
    setCurrent(prev => prev + 1);
    setSelected(null);
    setAnswered(false);
    setTimer(30);
  };

  const finishQuiz = async () => {
    setFinished(true);
    if (!studentId) return;
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (q:Quiz {
           id: $quizId, subject: $subject, chapter: $chapter,
           score: $score, total: $total, difficulty: $difficulty,
           time_taken: $timeTaken, date: datetime()
         })
         CREATE (s)-[:ATTEMPTED]->(q)`,
        {
          studentId,
          quizId: uuidv4(),
          subject: params.subject,
          chapter: params.chapter,
          score,
          total: questions.length,
          difficulty: params.difficulty,
          timeTaken: totalTime,
        }
      );
    } catch (err) {
      console.error('Failed to save quiz:', err);
    }
  };

  const getGrade = () => {
    const pct = (score / questions.length) * 100;
    if (pct >= 90) return 'A+';
    if (pct >= 75) return 'A';
    if (pct >= 60) return 'B';
    if (pct >= 40) return 'C';
    return 'F';
  };

  // Loading state
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Generating quiz...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.text }]}>Failed to generate quiz</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={generateQuiz}>
          <Text style={[{ color: colors.onPrimary, fontWeight: '600' }]}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={[{ color: colors.textSecondary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Results
  if (finished) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.resultContent}>
        <Text style={[styles.resultTitle, { color: colors.text }]}>Quiz Complete!</Text>
        <ScoreCircle obtained={score} total={questions.length} label={getGrade()} />
        <View style={styles.resultStats}>
          <View style={[styles.resultStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.resultStatValue, { color: colors.text }]}>{getGrade()}</Text>
            <Text style={[styles.resultStatLabel, { color: colors.textTertiary }]}>Grade</Text>
          </View>
          <View style={[styles.resultStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.resultStatValue, { color: colors.text }]}>
              {Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}
            </Text>
            <Text style={[styles.resultStatLabel, { color: colors.textTertiary }]}>Time</Text>
          </View>
        </View>

        {wrongAnswers.length > 0 && (
          <View style={[styles.wrongSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.wrongTitle, { color: colors.text }]}>Questions You Got Wrong</Text>
            {wrongAnswers.map((w, i) => (
              <View key={i} style={[styles.wrongItem, { borderBottomColor: colors.border }]}>
                <Text style={[styles.wrongQ, { color: colors.text }]}>{w.q.question}</Text>
                <Text style={[styles.wrongYour, { color: colors.error }]}>Your answer: {w.selected}</Text>
                <Text style={[styles.wrongCorrect, { color: colors.success }]}>Correct: {w.q.correct}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={[{ color: colors.onPrimary, fontSize: 16, fontWeight: '600' }]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Quiz play
  const q = questions[current];
  const timerColor = timer <= 5 ? '#EF4444' : timer <= 10 ? '#F59E0B' : colors.text;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Progress bar */}
      <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
        <View style={[styles.progressBarFill, {
          backgroundColor: colors.primary,
          width: `${((current + 1) / questions.length) * 100}%`,
        }]} />
      </View>

      {/* Header */}
      <View style={styles.quizHeader}>
        <Text style={[styles.questionNum, { color: colors.text }]}>Q{current + 1} of {questions.length}</Text>
        <Text style={[styles.timerText, { color: timerColor }]}>
          {timer}s
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.quizContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.questionText, { color: colors.text }]}>{q.question}</Text>

        {q.options.map((opt, i) => {
          const isCorrect = opt === q.correct;
          const isSelected = opt === selected;
          let optBg = colors.surface;
          let optBorder = colors.border;
          let optTextColor = colors.text;

          if (answered) {
            if (isCorrect) { optBg = '#179C6E18'; optBorder = '#179C6E'; optTextColor = '#179C6E'; }
            else if (isSelected) { optBg = '#EF444418'; optBorder = '#EF4444'; optTextColor = '#EF4444'; }
          } else if (isSelected) {
            optBg = colors.primaryContainer; optBorder = colors.primary;
          }

          return (
            <TouchableOpacity
              key={i}
              style={[styles.optionBtn, { backgroundColor: optBg, borderColor: optBorder }]}
              onPress={() => handleSelect(opt)}
              disabled={answered}
            >
              <Text style={[styles.optionText, { color: optTextColor }]}>{opt}</Text>
              {answered && isCorrect && <Ionicons name="checkmark-circle" size={20} color="#179C6E" />}
              {answered && isSelected && !isCorrect && <Ionicons name="close-circle" size={20} color="#EF4444" />}
            </TouchableOpacity>
          );
        })}

        {/* Explanation */}
        {answered && (
          <View style={[styles.explanation, { backgroundColor: colors.surfaceContainer }]}>
            <Text style={[styles.expLabel, { color: colors.primary }]}>Explanation</Text>
            <Text style={[styles.expText, { color: colors.text }]}>{q.explanation}</Text>
          </View>
        )}
      </ScrollView>

      {/* Next button */}
      {answered && (
        <TouchableOpacity style={[styles.nextQuizBtn, { backgroundColor: colors.primary }]} onPress={handleNext}>
          <Text style={[{ color: colors.onPrimary, fontSize: 16, fontWeight: '600' }]}>
            {current >= questions.length - 1 ? 'See Results' : 'Next Question'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 15, fontWeight: '500' },
  errorText: { marginTop: 12, fontSize: 16, fontWeight: '600' },
  retryBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  progressBarBg: { height: 5, width: '100%' },
  progressBarFill: { height: 5, borderRadius: 3 },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  questionNum: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  timerText: { fontSize: 16, fontWeight: '800' },
  quizContent: { padding: 20, paddingBottom: 100 },
  questionText: { fontSize: 18, fontWeight: '500', lineHeight: 28, marginBottom: 24 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderRadius: 14, borderWidth: 1.5, marginBottom: 10,
  },
  optionText: { fontSize: 15, flex: 1, lineHeight: 22 },
  explanation: { borderRadius: 14, padding: 18, marginTop: 12 },
  expLabel: { fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' },
  expText: { fontSize: 14, lineHeight: 22 },
  nextQuizBtn: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 18, borderRadius: 14,
    shadowColor: '#070235', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  resultContent: { padding: 24, alignItems: 'center', paddingBottom: 40 },
  resultTitle: { fontSize: 28, fontWeight: '800', marginBottom: 24, letterSpacing: -0.5 },
  resultStats: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 24 },
  resultStat: {
    flex: 1, padding: 18, borderRadius: 16, borderWidth: 1, alignItems: 'center',
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
  },
  resultStatValue: { fontSize: 24, fontWeight: '800' },
  resultStatLabel: { fontSize: 11, marginTop: 6, fontWeight: '600', letterSpacing: 0.5 },
  wrongSection: {
    width: '100%', borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 20,
  },
  wrongTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  wrongItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  wrongQ: { fontSize: 14, fontWeight: '500', marginBottom: 6, lineHeight: 20 },
  wrongYour: { fontSize: 13, marginBottom: 3 },
  wrongCorrect: { fontSize: 13, fontWeight: '700' },
  doneBtn: {
    width: '100%', paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginTop: 8,
    shadowColor: '#070235', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
});
