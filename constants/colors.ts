// StudyMate AI — Design System Colors
// Based on Stitch design system: Minimalist-Modern, cognitive clarity

export const Colors = {
  light: {
    // Core surfaces
    background: '#F9F9FF',
    surface: '#FFFFFF',
    surfaceDim: '#D3DAEA',
    surfaceContainer: '#E7EEFE',
    surfaceContainerHigh: '#E2E8F8',
    surfaceContainerLow: '#F0F3FF',

    // Text
    text: '#151C27',
    textSecondary: '#47464F',
    textTertiary: '#787680',
    textInverse: '#FFFFFF',

    // Primary (Deep Indigo)
    primary: '#070235',
    primaryContainer: '#1E1B4B',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#8683BA',
    primaryFixed: '#E3DFFF',
    primaryFixedDim: '#C4C1FB',

    // Secondary (Amber/Gold)
    secondary: '#855300',
    secondaryContainer: '#FEA619',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#684000',
    secondaryFixed: '#FFDDB8',

    // Tertiary (Green)
    tertiary: '#000F07',
    tertiaryContainer: '#002819',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#179C6E',
    tertiaryFixed: '#85F8C4',

    // Status
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
    success: '#179C6E',
    successContainer: '#85F8C4',
    warning: '#FEA619',
    warningContainer: '#FFDDB8',

    // Borders / outlines
    outline: '#787680',
    outlineVariant: '#C8C5D0',
    border: '#E5E7EB',

    // Special
    inverseSurface: '#2A313D',
    inverseOnSurface: '#EBF1FF',
    surfaceTint: '#5B598C',

    // Tab bar
    tabBar: '#FFFFFF',
    tabBarBorder: '#E5E7EB',
    tabActive: '#070235',
    tabInactive: '#787680',
  },
  dark: {
    // Core surfaces
    background: '#0F0E1A',
    surface: '#1A1828',
    surfaceDim: '#0F0E1A',
    surfaceContainer: '#211F30',
    surfaceContainerHigh: '#2C2A3D',
    surfaceContainerLow: '#1A1828',

    // Text
    text: '#EBF1FF',
    textSecondary: '#B0B0C0',
    textTertiary: '#787690',
    textInverse: '#151C27',

    // Primary
    primary: '#C4C1FB',
    primaryContainer: '#444173',
    onPrimary: '#181445',
    onPrimaryContainer: '#E3DFFF',
    primaryFixed: '#E3DFFF',
    primaryFixedDim: '#C4C1FB',

    // Secondary
    secondary: '#FFB95F',
    secondaryContainer: '#653E00',
    onSecondary: '#2A1700',
    onSecondaryContainer: '#FFDDB8',
    secondaryFixed: '#FFDDB8',

    // Tertiary
    tertiary: '#68DBA9',
    tertiaryContainer: '#005137',
    onTertiary: '#002114',
    onTertiaryContainer: '#85F8C4',
    tertiaryFixed: '#85F8C4',

    // Status
    error: '#FFB4AB',
    errorContainer: '#93000A',
    success: '#68DBA9',
    successContainer: '#005137',
    warning: '#FFB95F',
    warningContainer: '#653E00',

    // Borders
    outline: '#918F9A',
    outlineVariant: '#47464F',
    border: '#2C2A3D',

    // Special
    inverseSurface: '#EBF1FF',
    inverseOnSurface: '#2A313D',
    surfaceTint: '#C4C1FB',

    // Tab bar
    tabBar: '#1A1828',
    tabBarBorder: '#2C2A3D',
    tabActive: '#C4C1FB',
    tabInactive: '#787690',
  },
};

// Subject accent colors — functional markers only
export const SubjectColors: Record<string, { light: string; dark: string }> = {
  'Physics': { light: '#3B82F6', dark: '#60A5FA' },
  'Chemistry': { light: '#F59E0B', dark: '#FBBF24' },
  'Mathematics': { light: '#EF4444', dark: '#F87171' },
  'Biology': { light: '#8B5CF6', dark: '#A78BFA' },
  'Computer Applications': { light: '#06B6D4', dark: '#22D3EE' },
  'History & Civics': { light: '#F97316', dark: '#FB923C' },
  'English': { light: '#10B981', dark: '#34D399' },
  'Geography': { light: '#EC4899', dark: '#F472B6' },
};

// Grade badge colors
export const GradeColors = {
  'A+': '#179C6E',
  'A': '#10B981',
  'B': '#3B82F6',
  'C': '#F59E0B',
  'F': '#EF4444',
};

// Performance dot colors
export const PerformanceDotColors = {
  excellent: '#179C6E', // >75%
  good: '#F59E0B',      // 50-75%
  weak: '#EF4444',      // <50%
  unattempted: '#C8C5D0', // not attempted
};

// Premium UI tokens
export const PremiumTokens = {
  light: {
    gradientStart: '#E0E7FF',
    gradientEnd: '#F9F9FF',
    gradientAccentStart: '#6366F1',
    gradientAccentEnd: '#8B5CF6',
    glassBg: 'rgba(255, 255, 255, 0.72)',
    glassBorder: 'rgba(255, 255, 255, 0.3)',
    shimmer: '#E8EEFF',
    cardShadowColor: '#1E1B4B',
    cardShadowOpacity: 0.08,
    cardShadowRadius: 24,
    cardShadowOffset: { width: 0, height: 8 },
    buttonGradientStart: '#070235',
    buttonGradientEnd: '#1E1B4B',
    successGradientStart: '#059669',
    successGradientEnd: '#10B981',
    warningGradientStart: '#D97706',
    warningGradientEnd: '#F59E0B',
    errorGradientStart: '#DC2626',
    errorGradientEnd: '#EF4444',
  },
  dark: {
    gradientStart: '#1E1B4B',
    gradientEnd: '#0F0E1A',
    gradientAccentStart: '#818CF8',
    gradientAccentEnd: '#A78BFA',
    glassBg: 'rgba(26, 24, 40, 0.72)',
    glassBorder: 'rgba(196, 193, 251, 0.12)',
    shimmer: '#2C2A3D',
    cardShadowColor: '#000000',
    cardShadowOpacity: 0.3,
    cardShadowRadius: 24,
    cardShadowOffset: { width: 0, height: 8 },
    buttonGradientStart: '#C4C1FB',
    buttonGradientEnd: '#A78BFA',
    successGradientStart: '#34D399',
    successGradientEnd: '#6EE7B7',
    warningGradientStart: '#FBBF24',
    warningGradientEnd: '#FCD34D',
    errorGradientStart: '#F87171',
    errorGradientEnd: '#FCA5A5',
  },
};

