import {
  startOfMonth, endOfMonth, subMonths, addMonths,
  startOfYear, endOfYear, subYears, addYears,
  subDays, addDays,
  format,
} from "date-fns";

export type PeriodPresetKey =
  | "all_time"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "last_180_days"
  | "last_365_days"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "last_year";

export type PresetGroup = "quick" | "months" | "years";

export interface PeriodPreset {
  key: PeriodPresetKey;
  label: string;
  group: PresetGroup;
  computeDates: (offset: number) => { dateFrom: string; dateTo: string };
  formatLabel: (offset: number) => string;
}

function fmt(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const MONTH_NAMES = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

export const PERIOD_PRESETS: PeriodPreset[] = [
  // ── Quick (rolling) ──
  {
    key: "last_7_days",
    label: "7 zile",
    group: "quick",
    computeDates: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 7);
      const start = subDays(end, 6);
      return { dateFrom: fmt(start), dateTo: fmt(end) };
    },
    formatLabel: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 7);
      const start = subDays(end, 6);
      return `${format(start, "dd.MM")} — ${format(end, "dd.MM.yyyy")}`;
    },
  },
  {
    key: "last_30_days",
    label: "30 zile",
    group: "quick",
    computeDates: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 30);
      const start = subDays(end, 29);
      return { dateFrom: fmt(start), dateTo: fmt(end) };
    },
    formatLabel: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 30);
      const start = subDays(end, 29);
      return `${format(start, "dd.MM")} — ${format(end, "dd.MM.yyyy")}`;
    },
  },
  {
    key: "last_90_days",
    label: "90 zile",
    group: "quick",
    computeDates: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 90);
      const start = subDays(end, 89);
      return { dateFrom: fmt(start), dateTo: fmt(end) };
    },
    formatLabel: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 90);
      const start = subDays(end, 89);
      return `${format(start, "dd.MM.yy")} — ${format(end, "dd.MM.yy")}`;
    },
  },
  {
    key: "last_180_days",
    label: "180 zile",
    group: "quick",
    computeDates: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 180);
      const start = subDays(end, 179);
      return { dateFrom: fmt(start), dateTo: fmt(end) };
    },
    formatLabel: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 180);
      const start = subDays(end, 179);
      return `${format(start, "dd.MM.yy")} — ${format(end, "dd.MM.yy")}`;
    },
  },
  {
    key: "last_365_days",
    label: "365 zile",
    group: "quick",
    computeDates: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 365);
      const start = subDays(end, 364);
      return { dateFrom: fmt(start), dateTo: fmt(end) };
    },
    formatLabel: (offset) => {
      const baseEnd = subDays(new Date(), 1);
      const end = addDays(baseEnd, offset * 365);
      const start = subDays(end, 364);
      return `${format(start, "dd.MM.yy")} — ${format(end, "dd.MM.yy")}`;
    },
  },
  // ── All time ──
  {
    key: "all_time",
    label: "Tot timpul",
    group: "quick",
    computeDates: () => {
      return { dateFrom: "", dateTo: "" };
    },
    formatLabel: () => "Tot timpul",
  },

  // ── Months ──
  {
    key: "this_month",
    label: "Luna curentă",
    group: "months",
    computeDates: (offset) => {
      const month = addMonths(new Date(), offset);
      return { dateFrom: fmt(startOfMonth(month)), dateTo: fmt(endOfMonth(month)) };
    },
    formatLabel: (offset) => {
      const month = addMonths(new Date(), offset);
      return `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`;
    },
  },
  {
    key: "last_month",
    label: "Luna trecută",
    group: "months",
    computeDates: (offset) => {
      const month = addMonths(subMonths(new Date(), 1), offset);
      return { dateFrom: fmt(startOfMonth(month)), dateTo: fmt(endOfMonth(month)) };
    },
    formatLabel: (offset) => {
      const month = addMonths(subMonths(new Date(), 1), offset);
      return `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`;
    },
  },
  {
    key: "last_3_months",
    label: "3 luni",
    group: "months",
    computeDates: (offset) => {
      const baseEnd = subMonths(new Date(), 1);
      const end = addMonths(baseEnd, offset * 3);
      const start = subMonths(end, 2);
      return { dateFrom: fmt(startOfMonth(start)), dateTo: fmt(endOfMonth(end)) };
    },
    formatLabel: (offset) => {
      const baseEnd = subMonths(new Date(), 1);
      const end = addMonths(baseEnd, offset * 3);
      const start = subMonths(end, 2);
      return `${MONTH_NAMES[start.getMonth()]} — ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
    },
  },
  {
    key: "last_6_months",
    label: "6 luni",
    group: "months",
    computeDates: (offset) => {
      const baseEnd = subMonths(new Date(), 1);
      const end = addMonths(baseEnd, offset * 6);
      const start = subMonths(end, 5);
      return { dateFrom: fmt(startOfMonth(start)), dateTo: fmt(endOfMonth(end)) };
    },
    formatLabel: (offset) => {
      const baseEnd = subMonths(new Date(), 1);
      const end = addMonths(baseEnd, offset * 6);
      const start = subMonths(end, 5);
      return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()} — ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
    },
  },

  // ── Years ──
  {
    key: "this_year",
    label: "Anul curent",
    group: "years",
    computeDates: (offset) => {
      const year = addYears(new Date(), offset);
      return { dateFrom: fmt(startOfYear(year)), dateTo: fmt(endOfYear(year)) };
    },
    formatLabel: (offset) => {
      const year = addYears(new Date(), offset);
      return `${year.getFullYear()}`;
    },
  },
  {
    key: "last_year",
    label: "Anul trecut",
    group: "years",
    computeDates: (offset) => {
      const year = addYears(subYears(new Date(), 1), offset);
      return { dateFrom: fmt(startOfYear(year)), dateTo: fmt(endOfYear(year)) };
    },
    formatLabel: (offset) => {
      const year = addYears(subYears(new Date(), 1), offset);
      return `${year.getFullYear()}`;
    },
  },
];

export const PRESET_GROUPS: { key: PresetGroup; label: string }[] = [
  { key: "quick", label: "Ultimele" },
  { key: "months", label: "Luni" },
  { key: "years", label: "Ani" },
];

export function computeDatesForPreset(
  key: PeriodPresetKey,
  offset: number = 0,
): { dateFrom: string; dateTo: string } {
  const preset = PERIOD_PRESETS.find((p) => p.key === key);
  if (!preset) throw new Error(`Unknown preset: ${key}`);
  return preset.computeDates(offset);
}

export function formatPresetLabel(key: PeriodPresetKey, offset: number): string {
  const preset = PERIOD_PRESETS.find((p) => p.key === key);
  if (!preset) return "";
  return preset.formatLabel(offset);
}

/** Check if stepping forward (offset+1) would produce a period starting after today */
export function canStepForward(key: PeriodPresetKey, offset: number): boolean {
  if (key === "all_time") return false;
  const preset = PERIOD_PRESETS.find((p) => p.key === key);
  if (!preset) return false;
  const { dateFrom } = preset.computeDates(offset + 1);
  return dateFrom <= fmt(new Date());
}

/** Whether this preset supports offset navigation */
export function canNavigate(key: PeriodPresetKey): boolean {
  return key !== "all_time";
}
