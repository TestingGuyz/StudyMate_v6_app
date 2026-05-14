// MOCK EXAM GENERATOR — Feature #17
// Generates full exam paper in ICSE/CBSE format, student photographs answers for grading

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callGroq, callGroqVision, parseGroqJSON } from '../../lib/groq';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { ScoreCircle } from '../../components/ScoreCircle';
import { v4 as uuidv4 } from 'uuid';

type ExamType = 'Mid-Term' | 'Final' | 'Board Pattern';

export default function MockExamScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [step, setStep] = useState<'config' | 'paper' | 'upload' | 'result'>('config');
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState<ExamType>('Board Pattern');
  const [paper, setPaper] = useState('');
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [images, setImages] = useState<string[]>([]);
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  const generatePaper = async () => {
    if (!subject || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const result = await callGroq(
        [
          { role: 'system', content: `You are a ${board} exam paper setter for Class ${classNum}. ${context}` },
          {
            role: 'user',
            content: `Generate a complete ${examType} exam paper for ${subject}, ${board} Class ${classNum}.

Format exactly as a real ${board} exam paper:

${subject.toUpperCase()} — ${examType.toUpperCase()} EXAMINATION
Class ${classNum} | ${board} | Time: 2 Hours | Maximum Marks: 80

SECTION A — Objective (20 marks)
(10 MCQ/fill-in-the-blank/true-false questions, 2 marks each)

SECTION B — Short Answer (20 marks)
(5 questions, 4 marks each — answer in 3-4 sentences)

SECTION C — Long Answer (24 marks)
(3 questions, 8 marks each — answer in paragraphs with diagrams if needed)

SECTION D — Application (16 marks)
(2 real-world application questions, 8 marks each)

Bias questions toward this student's WEAK areas. Make it realistic and exam-appropriate.`,
          },
        ],
        'quiz_generator'
      );
      setPaper(result);
      setStep('paper');
    } catch (err: any) {
      setPaper(err.message || 'Failed to generate paper');
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (!res.canceled && res.assets[0]) {
      setImages(prev => [...prev, res.assets[0].uri]);
      setImagesBase64(prev => [...prev, res.assets[0].base64 || '']);
    }
  };

  const handleGradePaper = async () => {
    if (imagesBase64.length === 0 || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      // Grade using first image (primary answer sheet)
      const gradeResult = await callGroqVision(
        `You are a strict ${board} examiner. ${context}`,
        imagesBase64[0],
        `This student's answer sheet for a ${subject} ${examType} exam (${board} Class ${classNum}).
Grade the complete paper. Return ONLY valid JSON:
{
  "section_a": {"obtained": number, "max": 20},
  "section_b": {"obtained": number, "max": 20},
  "section_c": {"obtained": number, "max": 24},
  "section_d": {"obtained": number, "max": 16},
  "total_obtained": number,
  "total_max": 80,
  "predicted_board_grade": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "improvement_plan": ["string"],
  "examiner_note": "string"
}`,
        'answer_grader'
      );

      const parsed = parseGroqJSON<any>(gradeResult);
      setResult(parsed);
      setStep('result');

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (a:AnswerSubmission {
           id: $id, subject: $subject, chapter: 'Mock Exam',
           question: $examType, marks_obtained: $obtained,
           marks_max: $max, feedback: $weaknesses, date: datetime()
         })
         CREATE (s)-[:SUBMITTED]->(a)`,
        {
          studentId, id: uuidv4(), subject, examType,
          obtained: parsed.total_obtained, max: parsed.total_max,
          weaknesses: parsed.weaknesses,
        }
      );
    } catch (err: any) {
      setResult(null);
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
        <Text style={[styles.title, { color: colors.text }]}>Mock Exam</Text>
        <View style={{ width: 24 }} />
      </View>

      {step === 'config' && (
        <>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Generate a complete exam paper, write your answers on paper, photograph them for AI grading
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>SELECT SUBJECT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SUBJECTS.map(s => (
                <TouchableOpacity key={s.name} onPress={() => setSubject(s.name)}
                  style={[styles.pill, { backgroundColor: subject === s.name ? colors.primary : colors.surface, borderColor: subject === s.name ? colors.primary : colors.border }]}>
                  <Text style={{ color: subject === s.name ? colors.onPrimary : colors.text, fontSize: 13 }}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.label, { color: colors.textSecondary }]}>EXAM TYPE</Text>
          <View style={styles.typeRow}>
            {(['Mid-Term', 'Final', 'Board Pattern'] as ExamType[]).map(t => (
              <TouchableOpacity key={t} style={[styles.typePill, {
                backgroundColor: examType === t ? colors.primary : colors.surface,
                borderColor: examType === t ? colors.primary : colors.border,
              }]} onPress={() => setExamType(t)}>
                <Text style={{ color: examType === t ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: '500' }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: subject ? colors.primary : colors.surfaceContainerHigh }]}
            onPress={generatePaper} disabled={!subject || loading}
          >
            {loading ? <ActivityIndicator color={colors.onPrimary} /> : (
              <>
                <Ionicons name="document-text" size={18} color={subject ? colors.onPrimary : colors.textTertiary} />
                <Text style={{ color: subject ? colors.onPrimary : colors.textTertiary, fontSize: 15, fontWeight: '600' }}>Generate Exam Paper</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}

      {step === 'paper' && (
        <>
          <View style={[styles.paperCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.paperHeader}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <Text style={[styles.paperTitle, { color: colors.primary }]}>{subject} — {examType}</Text>
            </View>
            <Text style={[styles.paperText, { color: colors.text }]}>{paper}</Text>
          </View>

          <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.primary }]}
            onPress={() => setStep('upload')}>
            <Ionicons name="camera" size={18} color={colors.onPrimary} />
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: '600' }}>I've written my answers — Upload</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'upload' && (
        <>
          <Text style={[styles.label, { color: colors.textSecondary }]}>PHOTOGRAPH YOUR ANSWER SHEETS</Text>
          <View style={styles.imageGrid}>
            {images.map((img, i) => (
              <View key={i} style={styles.imgThumb}>
                <Image source={{ uri: img }} style={styles.thumbImg} />
                <TouchableOpacity style={[styles.removeImg, { backgroundColor: colors.error }]}
                  onPress={() => { setImages(prev => prev.filter((_, j) => j !== i)); setImagesBase64(prev => prev.filter((_, j) => j !== i)); }}>
                  <Ionicons name="close" size={12} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={[styles.addImgBtn, { borderColor: colors.border }]} onPress={handlePickImage}>
              <Ionicons name="add" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {images.length > 0 && (
            <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.primary }]}
              onPress={handleGradePaper} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.onPrimary} /> : (
                <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: '600' }}>Grade My Paper</Text>
              )}
            </TouchableOpacity>
          )}
        </>
      )}

      {step === 'result' && result && (
        <>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <ScoreCircle obtained={result.total_obtained} total={result.total_max}
              label={result.predicted_board_grade || 'Grade'} />
          </View>

          <Text style={[styles.predGrade, { color: colors.primary }]}>
            Predicted Board Grade: {result.predicted_board_grade}
          </Text>

          {[
            { label: 'Section A (Objective)', ...result.section_a, color: '#3B82F6' },
            { label: 'Section B (Short)', ...result.section_b, color: '#179C6E' },
            { label: 'Section C (Long)', ...result.section_c, color: '#8B5CF6' },
            { label: 'Section D (Application)', ...result.section_d, color: '#F59E0B' },
          ].map(s => (
            <View key={s.label} style={styles.sectionScore}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>{s.label}</Text>
              <View style={[styles.sectionBar, { backgroundColor: colors.border }]}>
                <View style={[styles.sectionFill, { width: `${(s.obtained / s.max) * 100}%`, backgroundColor: s.color }]} />
              </View>
              <Text style={[styles.sectionVal, { color: colors.textSecondary }]}>{s.obtained}/{s.max}</Text>
            </View>
          ))}

          {result.examiner_note && (
            <View style={[styles.noteBox, { backgroundColor: colors.surfaceContainer }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={[{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 20 }]}>
                {result.examiner_note}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
            onPress={() => { setStep('config'); setResult(null); setPaper(''); setImages([]); setImagesBase64([]); }}>
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: '600' }}>New Exam</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10, marginTop: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typePill: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 8, marginTop: 28,
  },
  paperCard: { borderRadius: 12, borderWidth: 1, padding: 20, marginBottom: 16 },
  paperHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  paperTitle: { fontSize: 14, fontWeight: '600' },
  paperText: { fontSize: 14, lineHeight: 24 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  imgThumb: { width: 100, height: 100, borderRadius: 8, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  removeImg: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addImgBtn: { width: 100, height: 100, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  predGrade: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  sectionScore: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionLabel: { width: 140, fontSize: 13, fontWeight: '500' },
  sectionBar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  sectionFill: { height: 6, borderRadius: 3 },
  sectionVal: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '600' },
  noteBox: { flexDirection: 'row', gap: 8, padding: 16, borderRadius: 8, marginTop: 16, alignItems: 'flex-start' },
});
