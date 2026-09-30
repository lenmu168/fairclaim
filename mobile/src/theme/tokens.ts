export const palette = {
  background: '#05070B',
  backgroundRaised: '#080D14',
  surface: '#0D141D',
  surfaceStrong: '#0D141D',
  surfaceSoft: '#111A24',
  mint: '#68F5C2',
  cyan: '#38DCF2',
  lime: '#B7FF5A',
  violet: '#826BFF',
  magenta: '#C86DFF',
  text: '#F5F7FA',
  textSecondary: '#96A3B2',
  textMuted: '#657383',
  border: 'rgba(102,224,213,0.16)',
  borderBright: 'rgba(102,224,213,0.34)',
  success: '#68F5C2',
  blocked: '#FF927A',
  warning: '#F5C66A',
  black: '#05070B',
  white: '#FFFFFF',
} as const

export const gradients = {
  primary: [palette.mint, palette.cyan, palette.violet],
  rewardHalo: ['rgba(104,245,194,0.16)', 'rgba(56,220,242,0.09)', 'rgba(130,107,255,0.07)'],
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 30,
} as const

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const

export const typography = {
  trackingLabel: 1.6,
  trackingButton: 1.2,
} as const
