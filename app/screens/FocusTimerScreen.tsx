// FOCUS TIMER — Vision distraction detection, collectible orbs, premium dark UI

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, TextInput,
  Animated, Dimensions, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../lib/context';
import { writeQuery, readQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { SubjectColors } from '../../constants/colors';
import { v4 as uuidv4 } from 'uuid';
import { callGroqVision, hasAiApiKey } from '../../lib/groq';
import { levelUpByOne } from '../../lib/gamification';
import { useT } from '../../lib/translations';

type TimerState = 'setup' | 'study' | 'break' | 'complete';
type FocusStatus = 'unknown' | 'checking' | 'focused' | 'distracted';

interface FloatingOrb {
  id: string;
  x: number;
  y: number;
}

const { width: SW, height: SH } = Dimensions.get('window');
const RING_SIZE = 260;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const DISTRACTION_RESET_SEC = 5;
const VISION_POLL_MS = 15000;
const VISION_INITIAL_DELAY_MS = 3000;
const ORB_LIFETIME_MS = 15000;
const ORB_FIRST_DELAY_MS = 30000;
const ORB_INTERVAL_MIN_MS = 60000;
const ORB_INTERVAL_MAX_MS = 120000;

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function orbSpawnDelayMs(spawnIndex: number): number {
  if (spawnIndex === 0) return ORB_FIRST_DELAY_MS;
  return randomBetween(ORB_INTERVAL_MIN_MS, ORB_INTERVAL_MAX_MS);
}

export default function FocusTimerScreen() {
  const { studentId } = useAuth();
  const tr = useT();
  const [permission, requestPermission] = useCameraPermissions();

  const [state, setState] = useState<TimerState>('setup');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);

  const [isDistracted, setIsDistracted] = useState(false);
  const [distractionSecs, setDistractionSecs] = useState(0);
  const [focusStatus, setFocusStatus] = useState<FocusStatus>('unknown');
  const [visionBanner, setVisionBanner] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [apiKeyOk, setApiKeyOk] = useState<boolean | null>(null);

  const [totalOrbs, setTotalOrbs] = useState(6);
  const [orbsCollected, setOrbsCollected] = useState(0);
  const [activeOrb, setActiveOrb] = useState<FloatingOrb | null>(null);

  const distractionSecsRef = useRef(0);
  const visionBusyRef = useRef(false);
  const pausedByDistractionRef = useRef(false);
  const levelUpAwardedRef = useRef(false);
  const totalOrbsRef = useRef(6);
  const orbsSpawnedRef = useRef(0);
  const orbsCollectedRef = useRef(0);
  const stateRef = useRef<TimerState>('setup');
  const pausedRef = useRef(false);
  const activeOrbRef = useRef<FloatingOrb | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visionInitialRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  const subjectColor = SubjectColors[subject]?.dark || '#C4C1FB';
  const subjectIcon = SUBJECTS.find(s => s.name === subject)?.icon || 'book-outline';

  stateRef.current = state;
  pausedRef.current = paused;
  activeOrbRef.current = activeOrb;

  const clearOrbTimers = useCallback(() => {
    if (orbScheduleRef.current) clearTimeout(orbScheduleRef.current);
    if (orbHideRef.current) clearTimeout(orbHideRef.current);
    orbScheduleRef.current = null;
    orbHideRef.current = null;
  }, []);

  const clearVisionTimers = useCallback(() => {
    if (visionRef.current) clearInterval(visionRef.current);
    if (visionInitialRef.current) clearTimeout(visionInitialRef.current);
    visionRef.current = null;
    visionInitialRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    clearVisionTimers();
    clearOrbTimers();
  }, [clearVisionTimers, clearOrbTimers]);

  useEffect(() => {
    hasAiApiKey().then(setApiKeyOk).catch(() => setApiKeyOk(false));
  }, []);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const r = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P1D')
         RETURN sum(ss.duration_mins) AS total`,
        { studentId }
      );
      const total = r[0]?.get('total');
      setTodayTotal(typeof total === 'object' ? (total?.low ?? 0) : (total || 0));
    })();
  }, [studentId]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.5, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, [glowAnim]);

  const applyFocusResult = useCallback((distracted: boolean) => {
    if (distracted) {
      setFocusStatus('distracted');
      setIsDistracted(true);
      pausedByDistractionRef.current = true;
      setPaused(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    } else {
      setFocusStatus('focused');
      setIsDistracted(false);
      distractionSecsRef.current = 0;
      setDistractionSecs(0);
      if (pausedByDistractionRef.current) {
        pausedByDistractionRef.current = false;
        setPaused(false);
      }
    }
  }, []);

  const runFocusCheck = useCallback(async () => {
    if (visionBusyRef.current) return;
    if (stateRef.current !== 'study' || pausedRef.current) return;
    if (!apiKeyOk) {
      setVisionBanner('Add a Groq API key in Profile → Settings');
      return;
    }
    const cam = cameraRef.current;
    if (!cam || !cameraReady) return;

    visionBusyRef.current = true;
    setFocusStatus('checking');
    try {
      const photo = await cam.takePictureAsync({
        base64: true,
        quality: 0.35,
      });
      if (!photo?.base64) {
        setVisionBanner('Camera capture failed — retrying…');
        return;
      }

      const result = await callGroqVision(
        'You are a focus monitor. Reply with exactly one word: FOCUSED or DISTRACTED. No punctuation.',
        photo.base64,
        'Is the student at their desk, facing study materials or a screen, actively studying? DISTRACTED if using phone, looking away, eyes closed, or left the desk.',
        'focus_check'
      );

      applyFocusResult(result.trim().toUpperCase().includes('DISTRACTED'));
      setVisionBanner(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Focus check failed';
      console.warn('[FocusTimer] Vision check failed:', msg);
      setFocusStatus('unknown');
      setVisionBanner(
        msg.includes('API key') || msg.includes('not configured')
          ? 'Add Groq API key in Profile for focus detection'
          : 'Focus check unavailable — check network/API'
      );
    } finally {
      visionBusyRef.current = false;
    }
  }, [apiKeyOk, applyFocusResult, cameraReady]);

  const scheduleNextOrbSpawn = useCallback(() => {
    clearOrbTimers();
    if (stateRef.current !== 'study' || pausedRef.current) return;
    if (orbsSpawnedRef.current >= totalOrbsRef.current) return;
    if (activeOrbRef.current) return;

    const delay = orbSpawnDelayMs(orbsSpawnedRef.current);
    orbScheduleRef.current = setTimeout(() => {
      if (stateRef.current !== 'study' || pausedRef.current) return;
      if (orbsSpawnedRef.current >= totalOrbsRef.current) return;
      if (activeOrbRef.current) return;

      const orb: FloatingOrb = {
        id: uuidv4(),
        x: randomBetween(16, Math.max(16, SW - 72)),
        y: randomBetween(140, Math.max(200, SH * 0.58)),
      };
      orbsSpawnedRef.current += 1;
      setActiveOrb(orb);

      orbHideRef.current = setTimeout(() => {
        setActiveOrb(prev => {
          if (prev?.id === orb.id) {
            activeOrbRef.current = null;
            return null;
          }
          return prev;
        });
        scheduleNextOrbSpawn();
      }, ORB_LIFETIME_MS);
    }, delay);
  }, [clearOrbTimers]);

  const tryLevelUpFromOrbs = useCallback(async () => {
    if (levelUpAwardedRef.current || !studentId) return;
    if (orbsCollectedRef.current < totalOrbsRef.current) return;
    levelUpAwardedRef.current = true;
    try {
      await levelUpByOne(studentId);
      Alert.alert(tr('level_up'), tr('level_up_orbs'));
    } catch (err) {
      levelUpAwardedRef.current = false;
      console.error('Orb level-up failed:', err);
    }
  }, [studentId, tr]);

  const handleOrbTap = useCallback(async (orbId: string) => {
    if (!activeOrbRef.current || activeOrbRef.current.id !== orbId) return;
    if (orbHideRef.current) clearTimeout(orbHideRef.current);
    setActiveOrb(null);
    activeOrbRef.current = null;

    orbsCollectedRef.current += 1;
    const collected = orbsCollectedRef.current;
    setOrbsCollected(collected);

    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.35, duration: 100, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    scheduleNextOrbSpawn();

    if (collected >= totalOrbsRef.current) {
      await tryLevelUpFromOrbs();
    }
  }, [pulseAnim, scheduleNextOrbSpawn, tryLevelUpFromOrbs]);

  const resetTimerFull = useCallback(() => {
    setTimeLeft(duration * 60);
    setElapsed(0);
    setIsDistracted(false);
    pausedByDistractionRef.current = false;
    distractionSecsRef.current = 0;
    setDistractionSecs(0);
    setPaused(false);
    setFocusStatus('unknown');
  }, [duration]);

  useEffect(() => {
    if (state !== 'study' || !isDistracted) return;
    const tick = setInterval(() => {
      distractionSecsRef.current += 1;
      setDistractionSecs(distractionSecsRef.current);
      if (distractionSecsRef.current >= DISTRACTION_RESET_SEC) {
        resetTimerFull();
        Alert.alert(tr('distracted'), tr('timer_reset'));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [state, isDistracted, resetTimerFull, tr]);

  const handleComplete = useCallback(async () => {
    setState('complete');
    clearTimers();
    setActiveOrb(null);
    activeOrbRef.current = null;
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
  }, [clearTimers, elapsed, studentId, subject]);

  useEffect(() => {
    if ((state === 'study' || state === 'break') && !paused && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (state === 'study') {
              setState('break');
              return 5 * 60;
            }
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
        if (state === 'study') setElapsed(e => e + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state, paused, timeLeft, handleComplete]);

  // Vision polling — only when camera ready + permission + API key
  useEffect(() => {
    if (state !== 'study') {
      clearVisionTimers();
      setCameraReady(false);
      return;
    }

    if (!permission?.granted) {
      requestPermission();
      return;
    }

    if (!permission?.granted || !cameraReady || apiKeyOk === false) return;

    visionInitialRef.current = setTimeout(() => {
      runFocusCheck();
    }, VISION_INITIAL_DELAY_MS);
    visionRef.current = setInterval(runFocusCheck, VISION_POLL_MS);

    return clearVisionTimers;
  }, [state, permission?.granted, cameraReady, apiKeyOk, runFocusCheck, requestPermission, clearVisionTimers]);

  // Orb spawn loop — pause/resume aware
  useEffect(() => {
    if (state !== 'study') {
      clearOrbTimers();
      return;
    }
    if (paused) {
      clearOrbTimers();
      return;
    }
    if (!activeOrb && orbsSpawnedRef.current < totalOrbsRef.current) {
      scheduleNextOrbSpawn();
    }
  }, [state, paused, activeOrb, scheduleNextOrbSpawn, clearOrbTimers]);

  const handleStart = async () => {
    if (!subject) return;

    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(tr('focus_timer'), tr('camera_permission'));
      }
    }

    const orbCount = randomBetween(5, 8);
    totalOrbsRef.current = orbCount;
    orbsSpawnedRef.current = 0;
    orbsCollectedRef.current = 0;
    levelUpAwardedRef.current = false;
    setTotalOrbs(orbCount);
    setOrbsCollected(0);
    setActiveOrb(null);
    activeOrbRef.current = null;
    clearOrbTimers();
    clearVisionTimers();

    setState('study');
    setTimeLeft(duration * 60);
    setElapsed(0);
    setPaused(false);
    pausedByDistractionRef.current = false;
    setIsDistracted(false);
    setFocusStatus('unknown');
    setVisionBanner(apiKeyOk === false ? 'Add Groq API key in Profile for focus detection' : null);
    distractionSecsRef.current = 0;
    setDistractionSecs(0);
    setCameraReady(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progress = state === 'study' || state === 'break'
    ? 1 - timeLeft / (state === 'break' ? 5 * 60 : duration * 60)
    : 0;
  const ringOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));

  const focusDotColor =
    focusStatus === 'focused' ? '#22C55E'
      : focusStatus === 'distracted' ? '#EF4444'
        : focusStatus === 'checking' ? '#FBBF24'
          : '#6B7280';

  if (state === 'setup') {
    return (
      <LinearGradient colors={['#1E1B4B', '#0F0E1A']} style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#888" />
        </TouchableOpacity>

        <Text style={styles.setupTitle}>{tr('focus_timer')}</Text>
        <Text style={styles.setupSub}>{tr('configure_session')}</Text>

        {apiKeyOk === false && (
          <View style={styles.bannerWarn}>
            <Ionicons name="key-outline" size={16} color="#FBBF24" />
            <Text style={styles.bannerWarnText}>Add Groq API key in Profile for focus detection</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>{tr('select_subject')}</Text>
        <View style={styles.subjectGrid}>
          {SUBJECTS.map(s => (
            <TouchableOpacity
              key={s.name}
              style={[styles.subjectPill, subject === s.name && { borderColor: subjectColor, backgroundColor: `${subjectColor}18` }]}
              onPress={() => setSubject(s.name)}
            >
              <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={14} color={subject === s.name ? subjectColor : '#666'} />
              <Text style={[styles.subjectText, subject === s.name && { color: subjectColor }]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{tr('duration')}</Text>
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
              placeholder={tr('custom')}
              placeholderTextColor="#555"
              keyboardType="numeric"
              onChangeText={val => {
                const n = parseInt(val, 10);
                if (!isNaN(n) && n > 0) setDuration(n);
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
          <Text style={styles.startText}>{tr('start_session')}</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  if (state === 'complete') {
    const mins = Math.max(1, Math.round(elapsed / 60));
    return (
      <LinearGradient colors={['#1E1B4B', '#0F0E1A']} style={styles.container}>
        <Ionicons name="checkmark-circle" size={64} color="#179C6E" style={{ marginBottom: 24 }} />
        <Text style={styles.completeTitle}>{tr('session_complete')}</Text>
        <Text style={styles.completeSub}>{tr('studied_for')} {subject} {tr('for_minutes')} {mins} {tr('minutes')}</Text>
        <Text style={styles.todayTotal}>{tr('todays_total')}: {todayTotal} {tr('minutes')}</Text>
        {orbsCollected > 0 && (
          <Text style={styles.orbSummary}>
            {orbsCollected}/{totalOrbs} {tr('orbs_collected')}
          </Text>
        )}
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneText}>{tr('done')}</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const showCamera = state === 'study' && permission?.granted;

  return (
    <View style={styles.sessionRoot}>
      <LinearGradient colors={['#1E1B4B', '#0F0E1A', '#0F0E1A']} style={StyleSheet.absoluteFill} />

      {showCamera && (
        <View style={[styles.cameraPip, { borderColor: focusDotColor }]}>
          <CameraView
            ref={cameraRef}
            style={styles.cameraView}
            facing="front"
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={[styles.focusDot, { backgroundColor: focusDotColor }]} />
          <View style={styles.cameraBadge}>
            <Ionicons name="eye-outline" size={10} color="#fff" />
          </View>
        </View>
      )}

      {state === 'study' && !permission?.granted && (
        <TouchableOpacity style={styles.bannerWarn} onPress={() => requestPermission()}>
          <Ionicons name="camera-outline" size={16} color="#FBBF24" />
          <Text style={styles.bannerWarnText}>Tap to enable camera for focus detection</Text>
        </TouchableOpacity>
      )}

      {visionBanner && state === 'study' && (
        <View style={styles.bannerWarn}>
          <Ionicons name="information-circle-outline" size={16} color="#FBBF24" />
          <Text style={styles.bannerWarnText}>{visionBanner}</Text>
        </View>
      )}

      <View style={styles.timerBlock} pointerEvents="box-none">
        <Text style={styles.subjectDisplay}>{subject}</Text>
        <Text style={[styles.modeLabel, { color: subjectColor }]}>
          {state === 'study' ? tr('study') : tr('break')}
        </Text>

        <Animated.View style={{ opacity: glowAnim }}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke="#2C2A3D" strokeWidth={RING_STROKE} fill="none" />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={isDistracted ? '#EF4444' : subjectColor}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>
        </Animated.View>

        <Text style={[styles.timerDisplay, isDistracted && { color: '#EF4444' }]}>
          {formatTime(timeLeft)}
        </Text>

        {state === 'study' && (
          <View style={styles.orbCounter}>
            <Ionicons name="planet-outline" size={14} color={subjectColor} />
            <Text style={[styles.orbCounterText, { color: subjectColor }]}>
              {orbsCollected}/{totalOrbs} {tr('orbs_collected')}
            </Text>
          </View>
        )}
      </View>

      {activeOrb && state === 'study' && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.orbLayer, { left: activeOrb.x, top: activeOrb.y, transform: [{ scale: pulseAnim }] }]}
        >
          <TouchableOpacity
            onPress={() => handleOrbTap(activeOrb.id)}
            activeOpacity={0.85}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <LinearGradient colors={[subjectColor, '#818CF8']} style={styles.orbInner}>
              <Ionicons name={subjectIcon as keyof typeof Ionicons.glyphMap} size={24} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {isDistracted && state === 'study' && (
        <View style={styles.distractionOverlay} pointerEvents="auto">
          <Ionicons name="warning" size={40} color="#EF4444" />
          <Text style={styles.distractionTitle}>{tr('distracted')}</Text>
          <Text style={styles.distractionSub}>{tr('refocus')}</Text>
          {distractionSecs > 0 && (
            <Text style={styles.distractionCount}>
              {tr('reset_in')} {DISTRACTION_RESET_SEC - distractionSecs}s
            </Text>
          )}
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => {
            if (isDistracted) return;
            pausedByDistractionRef.current = false;
            setPaused(p => !p);
          }}
        >
          <Ionicons name={paused ? 'play' : 'pause'} size={32} color="#FFF" />
        </TouchableOpacity>
        {state === 'break' && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => { setState('study'); setTimeLeft(duration * 60); }}
          >
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
    flex: 1,
    backgroundColor: '#0F0E1A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sessionRoot: {
    flex: 1,
    backgroundColor: '#0F0E1A',
  },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, right: 20, zIndex: 10 },
  setupTitle: { fontSize: 28, fontWeight: '700', color: '#EBF1FF', marginBottom: 8 },
  setupSub: { fontSize: 15, color: '#888', marginBottom: 32 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#666', letterSpacing: 1.5,
    marginBottom: 12, alignSelf: 'flex-start', marginTop: 20,
  },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  subjectPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#333',
  },
  subjectText: { color: '#888', fontSize: 12 },
  durationRow: { flexDirection: 'row', gap: 12, width: '100%' },
  durationPill: {
    flex: 1, paddingVertical: 16, borderRadius: 12, borderWidth: 1,
    borderColor: '#333', alignItems: 'center',
  },
  durationSelected: { borderColor: '#C4C1FB', backgroundColor: '#C4C1FB18' },
  durationNum: { fontSize: 22, fontWeight: '700', color: '#888' },
  durationNumSelected: { color: '#C4C1FB' },
  durationUnit: { fontSize: 12, color: '#666' },
  durationUnitSelected: { color: '#C4C1FB' },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#444173', paddingVertical: 18,
    borderRadius: 14, width: '100%', marginTop: 32,
  },
  startText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  bannerWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
    alignSelf: 'stretch',
  },
  bannerWarnText: { flex: 1, color: '#FBBF24', fontSize: 12, fontWeight: '500' },
  cameraPip: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, left: 16, zIndex: 40,
    width: 80, height: 108, borderRadius: 12, overflow: 'hidden',
    borderWidth: 2,
  },
  cameraView: { flex: 1 },
  focusDot: {
    position: 'absolute', top: 6, right: 6, width: 10, height: 10,
    borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  cameraBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: 3,
  },
  timerBlock: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  subjectDisplay: { fontSize: 14, color: '#666', marginBottom: 8 },
  modeLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 2, marginBottom: 16 },
  timerDisplay: {
    fontSize: 56, fontWeight: '200', color: '#FFF',
    fontVariant: ['tabular-nums'], marginTop: -RING_SIZE * 0.55,
    marginBottom: 8,
  },
  orbCounter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  orbCounterText: { fontSize: 13, fontWeight: '600' },
  orbLayer: {
    position: 'absolute', zIndex: 50, elevation: 50,
  },
  orbInner: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#C4C1FB', shadowOpacity: 0.7, shadowRadius: 14, elevation: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
  },
  distractionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(15,14,26,0.55)', zIndex: 45,
    padding: 24,
  },
  distractionTitle: { fontSize: 18, fontWeight: '700', color: '#EF4444', marginTop: 12 },
  distractionSub: { fontSize: 14, color: '#ccc', marginTop: 8, textAlign: 'center' },
  distractionCount: { fontSize: 12, color: '#EF4444', marginTop: 12, fontWeight: '600' },
  controls: {
    flexDirection: 'row', gap: 32, justifyContent: 'center',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24, zIndex: 20,
  },
  controlBtn: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: '#333',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  completeTitle: { fontSize: 28, fontWeight: '700', color: '#EBF1FF', marginBottom: 8 },
  completeSub: { fontSize: 16, color: '#888', marginBottom: 4 },
  todayTotal: { fontSize: 14, color: '#666', marginBottom: 8 },
  orbSummary: { fontSize: 14, color: '#C4C1FB', marginBottom: 24 },
  doneBtn: { backgroundColor: '#444173', paddingHorizontal: 48, paddingVertical: 14, borderRadius: 12 },
  doneText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
