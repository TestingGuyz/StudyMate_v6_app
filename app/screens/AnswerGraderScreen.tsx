// ANSWER GRADER SCREEN — Step-by-step flow with vision grading
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callGroqVision, parseGroqJSON } from '../../lib/groq';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { ScoreCircle } from '../../components/ScoreCircle';
import { v4 as uuidv4 } from 'uuid';

interface GradeResult {
  content_marks: number;
  content_max: number;
  language_marks: number;
  language_max: number;
  presentation_marks: number;
  presentation_max: number;
  total_obtained: number;
  total_max: number;
  strengths: string[];
  missed_points: string[];
  improvements: string[];
  model_answer_outline: string[];
  examiner_note: string;
}

export default function AnswerGraderScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [step, setStep] = useState(1);
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [question, setQuestion] = useState('');
  const [maxMarks, setMaxMarks] = useState(10);
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [chapters, setChapters] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) setChapters(getChaptersForSubject(subject, board, classNum));
  }, [subject, board, classNum]);

  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    
    if (!res.canceled && res.assets[0]) {
      setLoading(true);
      try {
        // IMAGE OPTIMIZATION: Resize to max 1024px width and compress
        const manipResult = await ImageManipulator.manipulateAsync(
          res.assets[0].uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        setImage(manipResult.uri);
        setImageBase64(manipResult.base64 || null);
      } catch (e) {
        console.error('Image optimization failed', e);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGrade = async () => {
    if (!imageBase64 || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const prompt = `${context}
You are a strict ${board} examiner.
Question: ${question}
Maximum marks: ${maxMarks}
Subject: ${subject}, Chapter: ${chapter}
Class: ${classNum} ${board}

Evaluate the handwritten answer in the image.
Be honest. Do not inflate marks.
Consider: Content accuracy per ${board} syllabus, Completeness of answer, Language and terminology, Structure and presentation.

Return ONLY this exact JSON, no other text:
{
  "content_marks": number,
  "content_max": ${Math.round(maxMarks * 0.6)},
  "language_marks": number,
  "language_max": ${Math.round(maxMarks * 0.2)},
  "presentation_marks": number,
  "presentation_max": ${Math.round(maxMarks * 0.2)},
  "total_obtained": number,
  "total_max": ${maxMarks},
  "strengths": ["string", "string"],
  "missed_points": ["string", "string", "string"],
  "improvements": ["string", "string", "string"],
  "model_answer_outline": ["string", "string", "string"],
  "examiner_note": "string"
}`;

      let response: string;
      try {
        response = await callGroqVision('You are a strict exam grader.', imageBase64, prompt, 'answer_grader');
      } catch {
        // Retry once with cleaner prompt
        response = await callGroqVision('You are a strict exam grader. Return only valid JSON.', imageBase64, prompt, 'answer_grader');
      }

      const parsed = parseGroqJSON<GradeResult>(response);
      setResult(parsed);
      setStep(5);

      // Save to Neo4j
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (a:AnswerSubmission {
           id: $id, subject: $subject, chapter: $chapter,
           question: $question, marks_obtained: $obtained,
           marks_max: $max, feedback: $improvements,
           missed_points: $missed, date: datetime()
         })
         CREATE (s)-[:SUBMITTED]->(a)`,
        {
          studentId,
          id: uuidv4(),
          subject, chapter, question,
          obtained: parsed.total_obtained,
          max: parsed.total_max,
          improvements: parsed.improvements,
          missed: parsed.missed_points,
        }
      );
    } catch (err: any) {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>STEP 1 — Subject & Chapter</Text>
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
            {subject && (
              <ScrollView style={{ maxHeight: 180 }}>
                {chapters.map(ch => (
                  <TouchableOpacity key={ch} onPress={() => { setChapter(ch); setStep(2); }}
                    style={[styles.chapterRow, { borderBottomColor: colors.border }]}>
                    <Text style={[{ color: colors.text, fontSize: 14 }]}>{ch}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        );
      case 2:
        return (
          <>
            <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>STEP 2 — Question</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Type or speak the question text"
              placeholderTextColor={colors.textTertiary}
              value={question}
              onChangeText={setQuestion}
              multiline
            />
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: question.trim() ? colors.primary : colors.surfaceContainerHigh }]}
              onPress={() => question.trim() && setStep(3)}
              disabled={!question.trim()}>
              <Text style={[styles.nextText, { color: question.trim() ? colors.onPrimary : colors.textTertiary }]}>Next</Text>
            </TouchableOpacity>
          </>
        );
      case 3:
        return (
          <>
            <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>STEP 3 — Maximum Marks</Text>
            <View style={styles.marksRow}>
              <TouchableOpacity onPress={() => setMaxMarks(Math.max(1, maxMarks - 1))}
                style={[styles.markBtn, { borderColor: colors.border }]}>
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.marksValue, { color: colors.text }]}>{maxMarks}</Text>
              <TouchableOpacity onPress={() => setMaxMarks(maxMarks + 1)}
                style={[styles.markBtn, { borderColor: colors.border }]}>
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
              onPress={() => setStep(4)}>
              <Text style={[styles.nextText, { color: colors.onPrimary }]}>Next</Text>
            </TouchableOpacity>
          </>
        );
      case 4:
        return (
          <>
            <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>STEP 4 — Photo of Answer</Text>
            {image ? (
              <View style={styles.imageContainer}>
                <Image source={{ uri: image }} style={styles.answerImage} />
                <TouchableOpacity onPress={() => { setImage(null); setImageBase64(null); }}
                  style={[styles.removeImg, { backgroundColor: colors.error }]}>
                  <Ionicons name="close" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.pickArea, { borderColor: colors.border }]} onPress={handlePickImage}>
                <Ionicons name="camera-outline" size={48} color={colors.textTertiary} />
                <Text style={[{ color: colors.textSecondary, marginTop: 8 }]}>Tap to select a photo</Text>
                <Text style={[{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }]}>Ensure good lighting for accurate grading</Text>
              </TouchableOpacity>
            )}
            {image && (
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={handleGrade}
                disabled={loading}>
                {loading ? <ActivityIndicator color={colors.onPrimary} /> :
                  <Text style={[styles.nextText, { color: colors.onPrimary }]}>Grade My Answer</Text>}
              </TouchableOpacity>
            )}
          </>
        );
      case 5:
        if (!result) return null;
        return (
          <ScrollView>
            <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>EVALUATION REPORT</Text>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <ScoreCircle obtained={result.total_obtained} total={result.total_max} />
            </View>

            {[
              { label: 'Content', val: result.content_marks, max: result.content_max, color: '#179C6E' },
              { label: 'Language', val: result.language_marks, max: result.language_max, color: '#3B82F6' },
              { label: 'Presentation', val: result.presentation_marks, max: result.presentation_max, color: '#8B5CF6' },
            ].map(bar => (
              <View key={bar.label} style={styles.scoreBar}>
                <Text style={[styles.barLabel, { color: colors.text }]}>{bar.label}</Text>
                <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.barFill, { width: `${(bar.val / bar.max) * 100}%`, backgroundColor: bar.color }]} />
                </View>
                <Text style={[styles.barValue, { color: colors.textSecondary }]}>{bar.val}/{bar.max}</Text>
              </View>
            ))}

            <View style={[styles.section, { borderLeftColor: '#179C6E', backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: '#179C6E' }]}>✓ Strengths Identified</Text>
              {result.strengths.map((s, i) => (
                <Text key={i} style={[styles.bulletText, { color: colors.text }]}>• {s}</Text>
              ))}
            </View>

            <View style={[styles.section, { borderLeftColor: '#F59E0B', backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: '#F59E0B' }]}>⚡ Areas for Improvement</Text>
              {result.missed_points.map((s, i) => (
                <Text key={i} style={[styles.bulletText, { color: colors.text }]}>• {s}</Text>
              ))}
            </View>

            <View style={[styles.section, { borderLeftColor: '#3B82F6', backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: '#3B82F6' }]}>📋 Model Answer Reference</Text>
              {result.model_answer_outline.map((s, i) => (
                <Text key={i} style={[styles.bulletText, { color: colors.text }]}>{i + 1}. {s}</Text>
              ))}
            </View>

            <View style={[styles.examinerNote, { backgroundColor: colors.surfaceContainer }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.examinerText, { color: colors.textSecondary }]}>
                EXAMINER'S NOTE: {result.examiner_note}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.border, marginTop: 24 }]}
              onPress={() => { setStep(1); setResult(null); setImage(null); setQuestion(''); }}>
              <Text style={[{ color: colors.text, fontWeight: '600' }]}>New Question</Text>
            </TouchableOpacity>
          </ScrollView>
        );
      default: return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Answer Grader</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {step < 5 && (
          <View style={styles.stepRow}>
            {[1, 2, 3, 4].map(s => (
              <View key={s} style={[styles.stepDot, {
                backgroundColor: s <= step ? colors.primary : colors.border,
                flex: s === step ? 2 : 1,
              }]} />
            ))}
          </View>
        )}
        {renderStep()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 40 },
  stepRow: { flexDirection: 'row', gap: 4, marginBottom: 24 },
  stepDot: { height: 4, borderRadius: 2 },
  stepLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  chapterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 100, fontSize: 15, marginBottom: 16 },
  nextBtn: { paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  nextText: { fontSize: 16, fontWeight: '600' },
  marksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 24 },
  markBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  marksValue: { fontSize: 48, fontWeight: '700' },
  pickArea: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 48, alignItems: 'center' },
  imageContainer: { borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  answerImage: { width: '100%', height: 240, borderRadius: 12 },
  removeImg: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scoreBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  barLabel: { width: 90, fontSize: 13, fontWeight: '500' },
  barTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  barValue: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '600' },
  section: { borderLeftWidth: 3, borderRadius: 8, padding: 16, marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  bulletText: { fontSize: 14, lineHeight: 22, marginBottom: 4 },
  examinerNote: { flexDirection: 'row', gap: 8, padding: 16, borderRadius: 8, marginTop: 16, alignItems: 'flex-start' },
  examinerText: { flex: 1, fontSize: 13, fontStyle: 'italic', lineHeight: 20 },
  actionBtn: { paddingVertical: 14, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
});
