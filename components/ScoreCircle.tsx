// Score circle component — used in quiz results and answer grader

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../lib/context';

interface ScoreCircleProps {
  obtained: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showPercentage?: boolean;
}

export function ScoreCircle({
  obtained,
  total,
  size = 160,
  strokeWidth = 10,
  label,
  showPercentage = false,
}: ScoreCircleProps) {
  const { colors } = useTheme();
  const percentage = total > 0 ? (obtained / total) * 100 : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage >= 75) return '#179C6E';
    if (percentage >= 50) return '#F59E0B';
    return '#EF4444';
  };

  const getGrade = () => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 75) return 'A';
    if (percentage >= 60) return 'B';
    if (percentage >= 40) return 'C';
    return 'F';
  };

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[styles.textContainer, { width: size, height: size }]}>
        <Text style={[styles.score, { color: colors.text }]}>
          {showPercentage ? `${Math.round(percentage)}%` : obtained.toFixed(obtained % 1 === 0 ? 0 : 1)}
        </Text>
        {!showPercentage && (
          <Text style={[styles.total, { color: colors.textSecondary }]}>
            / {total}
          </Text>
        )}
        {label && (
          <Text style={[styles.label, { color: getColor() }]}>{label}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 36,
    fontWeight: '700',
    fontFamily: 'Inter',
  },
  total: {
    fontSize: 16,
    fontWeight: '400',
    marginTop: -4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'capitalize',
  },
});
