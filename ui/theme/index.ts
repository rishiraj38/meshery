import type { Theme } from '@sistent/sistent';

/**
 * Meshery UI theme entry point.
 *
 * Phase 1 uses this module as the approved, project-local import path for
 * theme primitives (`useTheme`, `styled`, `alpha`, `lighten`, `darken`, ...).
 * Prefer `@/theme` over importing those primitives directly from
 * {@link https://github.com/layer5io/sistent Sistent} or from legacy
 * `@/themes*` modules.
 *
 *   import { useTheme, styled, alpha } from '@/theme';
 *
 * The core theming rules are:
 *   - Colors come from `theme.palette.*` - never from a hex literal.
 *   - Spacing comes from `theme.spacing()` - never from a hard-coded pixel.
 *   - Breakpoints come from `theme.breakpoints.*`.
 *
 * `@/themes/hooks` remains for theme-preference plumbing until a later phase,
 * but new theme-entrypoint imports should start from `@/theme`.
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
