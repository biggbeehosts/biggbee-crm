/**
 * A small, premium, non-neon qualitative palette for multi-series charts (leads by country,
 * by service, etc). Kept short on purpose -- categories beyond this length get grouped as
 * "Other" by the calling component rather than the palette repeating garishly. Order matches
 * the app's controlled state-color system: blue (primary/neutral-lead), lime (live/top
 * performer), emerald (success), amber (warning), purple (a real distinct category), coral
 * (error/negative) -- so index 0 is always "the main series," not an arbitrary color.
 */
export const CHART_PALETTE = [
  "#5f8fff", // primary blue
  "#b9ef3d", // lime -- restrained, reserved for a genuinely top-performing/first series
  "#2fd18d", // emerald / success
  "#f5a524", // amber / warning
  "#a78bfa", // purple -- distinct category
  "#f2596b", // muted coral / error
  "#38bdf8", // sky -- overflow only
  "#94a3b8", // slate -- overflow / "unknown" bucket
];

export const CHART_GRID = "rgba(255,255,255,0.06)";
export const CHART_AXIS = "rgba(255,255,255,0.4)";
export const CHART_SUCCESS = "#2fd18d";
export const CHART_WARNING = "#f5a524";
export const CHART_DANGER = "#f2596b";
export const CHART_ACCENT = "#5f8fff";
export const CHART_LIME = "#b9ef3d";
export const CHART_NEUTRAL = "#94a3b8";
