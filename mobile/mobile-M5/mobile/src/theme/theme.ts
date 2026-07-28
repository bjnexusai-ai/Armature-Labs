/**
 * Shared design tokens — pulled directly from the web portal's index.html
 * (Admin Portal), per §4 of Armature_Labs_Mobile_App_Build_Plan_UPDATED.md.
 * Do not redesign these; if a token needs to change, change it in the web
 * portal first and mirror it here so the two clients stay visually aligned.
 */

export const colors = {
  // Core
  primaryTeal: '#1C8A93',
  primaryGreen: '#16A37A',
  buttonGreen: '#19868B',
  buttonGreenHover: '#146E72', // used as the `pressed` state on mobile
  backgroundTop: '#EAF7F5',
  backgroundBottom: '#FCFCFB',
  ink: '#0F2A2C',
  inkSoft: '#5B7472',
  border: '#DCEAE8',
  card: '#FFFFFF',

  // Status badge tones — { text, background }
  status: {
    teal: { text: '#1C8A93', background: '#DCF2EF' },
    green: { text: '#16A37A', background: '#DCF2E4' },
    coral: { text: '#C87156', background: '#F3DDD5' },
    amber: { text: '#E29141', background: '#FBE7D2' },
    tan: { text: '#3D949B', background: '#E3F3F2' },
  },

  // Semantic aliases built on the tokens above — not new colors
  danger: '#C87156', // coral, reused for destructive/error states
  warning: '#E29141', // amber, reused for pending/attention states
  success: '#16A37A', // green
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(15, 42, 44, 0.45)', // ink at 45% — modal/sheet scrims
} as const;

export type StatusTone = keyof typeof colors.status;

export const fontFamily = {
  headingBold: 'PlusJakartaSans_700Bold',
  headingExtraBold: 'PlusJakartaSans_800ExtraBold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const fontsToLoad = {
  PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
  PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  IBMPlexMono_400Regular: require('@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf'),
  IBMPlexMono_500Medium: require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf'),
};

export const typeScale = {
  display: 28,
  h1: 24,
  h2: 20,
  h3: 17,
  body: 15,
  bodySmall: 13,
  caption: 12,
  mono: 13,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Touch target minimum — mobile-specific, web portal has no equivalent. */
export const touchTarget = 44;

export const shadow = {
  card: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

export const theme = {
  colors,
  fontFamily,
  typeScale,
  spacing,
  radius,
  touchTarget,
  shadow,
} as const;

export type Theme = typeof theme;
