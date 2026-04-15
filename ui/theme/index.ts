import type { Theme } from '@sistent/sistent';

/**
 * Meshery UI theme entry point.
 *
 * This module is a thin wrapper around {@link https://github.com/layer5io/sistent Sistent},
 * the Meshery design system. It exists so that every consumer in the
 * Meshery UI imports theme primitives (`useTheme`, `styled`, `alpha`,
 * `lighten`, `darken`, ...) from a single, project-local path.
 *
 *   import { useTheme, styled, alpha } from '@/theme';
 *
 * The core theming rules are:
 *   - Colors come from `theme.palette.*` - never from a hex literal.
 *   - Spacing comes from `theme.spacing()` - never from a hard-coded pixel.
 *   - Breakpoints come from `theme.breakpoints.*`.
 *
 * If Sistent is missing a token the app needs, open an issue or PR upstream
 * rather than redefining it here. This file must remain a thin wrapper:
 * re-exports plus palette accessors that read directly from `theme.palette.*`.
 */

export {
  // Hooks
  useTheme,

  // CSS-in-JS
  styled,

  // Color helpers
  alpha,
  lighten,
  darken,

  // Providers & global primitives
  SistentThemeProvider,
  SistentThemeProviderWithoutBaseLine as SistentThemeProviderWithoutBaseline,
  CssBaseline,
  NoSsr,
} from '@sistent/sistent';

export type { Theme };

export const palette = {
  status: {
    error: (theme: Theme) => theme.palette.error.main,
    warning: (theme: Theme) => theme.palette.warning.main,
    success: (theme: Theme) => theme.palette.success.main,
    info: (theme: Theme) => theme.palette.info.main,
  },
  surface: {
    page: (theme: Theme) => theme.palette.background.default,
    elevated: (theme: Theme) => theme.palette.background.elevatedComponents,
    card: (theme: Theme) => theme.palette.background.card,
  },
} as const;
