// FOCUS TIMER — Full screen, always dark, minimal

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/context';
import { writeQuery, readQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { v4 as uuidv4 } from 'uuid';

type TimerState = 'setup' | 'study' | 'break' | 'complete';

export default function FocusTimerScreen() {
  const { studentId } = useAuth();
  const [state, setState] = useState<TimerState>('setup');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState(25); // minutes
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0); // total seconds studied
  const [todayTotal, setTodayTotal] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fetch today's total
    (async () => {
      if (!studentId) return;
      const r = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P1D')
         RETURN sum(ss.duration_mins) AS total`,
        { studentId }
      );
      setTodayTotal(r[0]?.get('total') || 0);
    })();
  }, [studentId]);

  useEffect(() => {
    if ((state === 'study' || state === 'break') && !paused && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (state === 'study') {
              setState('break');
              return 5 * 60; // 5 min break
            } else {
              handleComplete();
              return 0;
            }
          }
          return prev - 1;
        });
        if (state === 'study') setElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state, paused, timeLeft]);

  const handleStart = () => {
    if (!subject) return;
    setState('study');
    setTimeLeft(duration * 60);
    setElapsed(0);
  };

  const handleComplete = async () => {
    setState('complete');
    if (timerRef.current) clearInterval(timerRef.current);
    const mins = Math.max(1, Math.round(elapsed / 60));

    if (studentId) {
      try {
        await writeQuery(
          `MATCH (s:Student {id: $studentId})
           CREATE (ss:StudySession {
             id: $id, subject: $subject, chapter: '',
             duration_mins: $mins, session_type: 'focus_timer',
             date: datetime()
           })
           CREATE (s)-[:STUDIED]->(ss)`,
          { studentId, id: uuidv4(), subject, mins }
        );
        setTodayTotal(prev => prev + mins);
      } catch (err) {
        console.error('Failed to save session:', err);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Setup screen
  if (state === 'setup') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#888" />
        </TouchableOpacity>

        <Text style={styles.setupTitle}>Focus Timer</Text>
        <Text style={styles.setupSub}>Configure your study session</Text>

        <Text style={styles.sectionLabel}>SELECT SUBJECT</Text>
        <View style={styles.subjectGrid}>
          {SUBJECTS.map(s => (
            <TouchableOpacity
              key={s.name}
              style={[styles.subjectPill, subject === s.name && styles.subjectSelected]}
              onPress={() => setSubject(s.name)}
            >
              <Text style={[styles.subjectText, subject === s.name && styles.subjectTextSelected]}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>DURATION</Text>
        <View style={styles.durationRow}>
          {[25, 45, 60].map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.durationPill, duration === d && styles.durationSelected]}
              onPress={() => setDuration(d)}
            >
              <Text style={[styles.durationNum, duration === d && styles.durationNumSelected]}>{d}</Text>
              <Text style={[styles.durationUnit, duration === d && styles.durationUnitSelected]}>min</Text>
            </TouchableOpacity>
          ))}
          <View style={[styles.durationPill, ![25, 45, 60].includes(duration) && styles.durationSelected, { paddingVertical: 10 }]}>
             <TextInput
               style={[styles.durationNum, ![25, 45, 60].includes(duration) && styles.durationNumSelected, { fontSize: 18, textAlign: 'center', width: '100%' }]}
               placeholder="Custom"
               placeholderTextColor="#555"
               keyboardType="numeric"
               onChangeText={(t) => {
                 const n = parseInt(t);
                 if (!isNaN(n)) setDuration(n);
               }}
             />
             <Text style={[styles.durationUnit, ![25, 45, 60].includes(duration) && styles.durationUnitSelected]}>min</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.startBtn, !subject && { opacity: 0.4 }]}
          onPress={handleStart}
          disabled={!subject}
        >
          <Ionicons name="play" size={20} color="#FFF" />
          <Text style={styles.startText}>Start Session</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Complete screen
  if (state === 'complete') {
    const mins = Math.max(1, Math.round(elapsed / 60));
    return (
      <View style={styles.container}>
        <Ionicons name="checkmark-circle" size={64} color="#179C6E" style={{ marginBottom: 24 }} />
        <Text style={styles.completeTitle}>Session Complete!</Text>
        <Text style={styles.completeSub}>
          You studied {subject} for {mins} minutes
        </Text>
        <Text style={styles.todayTotal}>
          Today's total: {todayTotal} minutes
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Timer screen (study or break)
  return (
    <View style={styles.container}>
      <Text style={styles.subjectDisplay}>{subject}</Text>
      <Text style={styles.modeLabel}>{state === 'study' ? 'STUDY' : 'BREAK'}</Text>
      <Text style={styles.timerDisplay}>{formatTime(timeLeft)}</Text>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={() => setPaused(!paused)}>
          <Ionicons name={paused ? 'play' : 'pause'} size={32} color="#FFF" />
        </TouchableOpacity>
        {state === 'break' && (
          <TouchableOpacity style={styles.controlBtn} onPress={() => { setState('study'); setTimeLeft(duration * 60); }}>
            <Ionicons name="play-skip-forward" size={28} color="#888" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.controlBtn} onPress={handleComplete}>
          <Ionicons name="stop" size={28} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0F0E1A',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, right: 20 },
  setupTitle: { fontSize: 28, fontWeight: '700', color: '#EBF1FF', marginBottom: 8 },
  setupSub: { fontSize: 15, color: '#888', marginBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#666', letterSpacing: 1.5, marginBottom: 12, alignSelf: 'flex-start', marginTop: 20 },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  subjectPill: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#333',
  },
  subjectSelected: { backgroundColor: '#C4C1FB18', borderColor: '#C4C1FB' },
  subjectText: { color: '#888', fontSize: 13 },
  subjectTextSelected: { color: '#C4C1FB' },
  durationRow: { flexDirection: 'row', gap: 12, width: '100%' },
  durationPill: {
    flex: 1, paddingVertical: 16, borderRadius: 8, borderWidth: 1,
    borderColor: '#333', alignItems: 'center',
  },
  durationSelected: { borderColor: '#C4C1FB', backgroundColor: '#C4C1FB18' },
  durationNum: { fontSize: 22, fontWeight: '700', color: '#888' },
  durationNumSelected: { color: '#C4C1FB' },
  durationUnit: { fontSize: 12, color: '#666' },
  durationUnitSelected: { color: '#C4C1FB' },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#1E1B4B', paddingVertical: 18,
    borderRadius: 12, width: '100%', marginTop: 32,
  },
  startText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  subjectDisplay: { fontSize: 14, color: '#666', marginBottom: 8 },
  modeLabel: { fontSize: 14, fontWeight: '700', color: '#C4C1FB', letterSpacing: 2, marginBottom: 16 },
  timerDisplay: { fontSize: 80, fontWeight: '200', color: '#FFF', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', gap: 32, marginTop: 48 },
  controlBtn: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: '#333',
    alignItems: 'center', justifyContent: 'center',
  },
  completeTitle: { fontSize: 28, fontWeight: '700', color: '#EBF1FF', marginBottom: 8 },
  completeSub: { fontSize: 16, color: '#888', marginBottom: 4 },
  todayTotal: { fontSize: 14, color: '#666', marginBottom: 32 },
  doneBtn: { backgroundColor: '#1E1B4B', paddingHorizontal: 48, paddingVertical: 14, borderRadius: 8 },
  doneText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
