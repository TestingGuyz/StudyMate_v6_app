// Loading skeleton component — used on every async operation

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../lib/context';

interface LoadingSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function LoadingSkeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}: LoadingSkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.surfaceContainerHigh,
          opacity,
        },
        style,
      ]}
    />
  );
}

// Card skeleton
export function CardSkeleton({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <LoadingSkeleton width="60%" height={16} />
      <LoadingSkeleton width="100%" height={12} style={{ marginTop: 12 }} />
      <LoadingSkeleton width="80%" height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

// Full screen skeleton
export function ScreenSkeleton() {
  return (
    <View style={styles.screen}>
      <LoadingSkeleton width="50%" height={28} style={{ marginBottom: 24 }} />
      <CardSkeleton />
      <CardSkeleton style={{ marginTop: 16 }} />
      <CardSkeleton style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 12,
  },
  screen: {
    padding: 24,
    flex: 1,
  },
});
