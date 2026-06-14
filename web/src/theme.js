import { createContext, useContext } from 'react';

export const ThemeContext = createContext('dark');

export function useTheme() {
  return useContext(ThemeContext);
}

/** Shared chart tooltip styling for Recharts. */
export function chartTooltipProps(tc) {
  return {
    contentStyle: {
      background: tc.surface,
      border: `1px solid ${tc.border}`,
      borderRadius: 8,
      color: tc.textPrimary,
    },
    labelStyle: { color: tc.textPrimary },
    itemStyle: { color: tc.textSecondary },
  };
}

export const THEME_COLORS = {
  dark: {
    border: '#2a2f3d',
    grid: '#232830',
    surface: '#1a1d27',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    accent: '#fb923c',
    success: '#22c55e',
    danger: '#ef4444',
    warn: '#f59e0b',
    colors: ['#fb923c', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a78bfa'],
    areaFillOpacity: '55',
    events: {
      sessionStart: '#38bdf8',
      stop: '#64748b',
      afterAgentThought: '#a78bfa',
      afterFileEdit: '#4ade80',
      afterTabFileEdit: '#4ade80',
      beforeShellExecution: '#fbbf24',
      afterShellExecution: '#fcd34d',
      beforeMCPExecution: '#22d3ee',
      afterMCPExecution: '#67e8f9',
      postToolUse: '#f472b6',
      default: '#64748b',
    },
  },
  light: {
    border: '#ddd0c4',
    grid: '#e8ddd4',
    surface: '#ffffff',
    textPrimary: '#1c1917',
    textSecondary: '#78716c',
    textMuted: '#a8a29e',
    accent: '#ea580c',
    success: '#15803d',
    danger: '#b91c1c',
    warn: '#b45309',
    colors: ['#ea580c', '#15803d', '#b45309', '#be185d', '#0e7490', '#6d28d9'],
    areaFillOpacity: '44',
    events: {
      sessionStart: '#0284c7',
      stop: '#78716c',
      afterAgentThought: '#6d28d9',
      afterFileEdit: '#15803d',
      afterTabFileEdit: '#15803d',
      beforeShellExecution: '#b45309',
      afterShellExecution: '#92400e',
      beforeMCPExecution: '#0e7490',
      afterMCPExecution: '#155e75',
      postToolUse: '#be185d',
      default: '#78716c',
    },
  },
};
