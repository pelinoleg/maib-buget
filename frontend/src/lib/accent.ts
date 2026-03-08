// Accent color system — stores in localStorage, applies CSS variables to :root

export interface AccentColor {
  name: string;
  label: string;
  // preview swatch color (hex for rendering)
  swatch: string;
  // oklch values for CSS variables
  light: {
    primary: string;
    ring: string;
    sidebarPrimary: string;
  };
  dark: {
    primary: string;
    ring: string;
    sidebarPrimary: string;
  };
}

export const ACCENT_COLORS: AccentColor[] = [
  {
    name: "slate",
    label: "Slate",
    swatch: "#475569",
    light: { primary: "oklch(0.39 0.02 260)", ring: "oklch(0.45 0.03 260)", sidebarPrimary: "oklch(0.39 0.02 260)" },
    dark: { primary: "oklch(0.70 0.02 260)", ring: "oklch(0.65 0.03 260)", sidebarPrimary: "oklch(0.70 0.02 260)" },
  },
  {
    name: "gray",
    label: "Gray",
    swatch: "#4b5563",
    light: { primary: "oklch(0.39 0.01 250)", ring: "oklch(0.45 0.015 250)", sidebarPrimary: "oklch(0.39 0.01 250)" },
    dark: { primary: "oklch(0.70 0.01 250)", ring: "oklch(0.65 0.015 250)", sidebarPrimary: "oklch(0.70 0.01 250)" },
  },
  {
    name: "zinc",
    label: "Zinc",
    swatch: "#52525b",
    light: { primary: "oklch(0.39 0.01 285)", ring: "oklch(0.45 0.015 285)", sidebarPrimary: "oklch(0.39 0.01 285)" },
    dark: { primary: "oklch(0.70 0.01 285)", ring: "oklch(0.65 0.015 285)", sidebarPrimary: "oklch(0.70 0.01 285)" },
  },
  {
    name: "neutral",
    label: "Neutral",
    swatch: "#525252",
    light: { primary: "oklch(0.39 0 0)", ring: "oklch(0.45 0 0)", sidebarPrimary: "oklch(0.39 0 0)" },
    dark: { primary: "oklch(0.70 0 0)", ring: "oklch(0.65 0 0)", sidebarPrimary: "oklch(0.70 0 0)" },
  },
  {
    name: "stone",
    label: "Stone",
    swatch: "#57534e",
    light: { primary: "oklch(0.39 0.01 70)", ring: "oklch(0.45 0.015 70)", sidebarPrimary: "oklch(0.39 0.01 70)" },
    dark: { primary: "oklch(0.70 0.01 70)", ring: "oklch(0.65 0.015 70)", sidebarPrimary: "oklch(0.70 0.01 70)" },
  },
  {
    name: "red",
    label: "Red",
    swatch: "#ef4444",
    light: { primary: "oklch(0.55 0.22 25)", ring: "oklch(0.55 0.22 25)", sidebarPrimary: "oklch(0.50 0.22 25)" },
    dark: { primary: "oklch(0.70 0.18 25)", ring: "oklch(0.65 0.18 25)", sidebarPrimary: "oklch(0.70 0.18 25)" },
  },
  {
    name: "orange",
    label: "Orange",
    swatch: "#f97316",
    light: { primary: "oklch(0.58 0.18 50)", ring: "oklch(0.58 0.18 50)", sidebarPrimary: "oklch(0.53 0.18 50)" },
    dark: { primary: "oklch(0.72 0.15 50)", ring: "oklch(0.68 0.15 50)", sidebarPrimary: "oklch(0.72 0.15 50)" },
  },
  {
    name: "amber",
    label: "Amber",
    swatch: "#f59e0b",
    light: { primary: "oklch(0.55 0.16 75)", ring: "oklch(0.55 0.16 75)", sidebarPrimary: "oklch(0.50 0.16 75)" },
    dark: { primary: "oklch(0.75 0.14 75)", ring: "oklch(0.70 0.14 75)", sidebarPrimary: "oklch(0.75 0.14 75)" },
  },
  {
    name: "yellow",
    label: "Yellow",
    swatch: "#eab308",
    light: { primary: "oklch(0.55 0.16 90)", ring: "oklch(0.55 0.16 90)", sidebarPrimary: "oklch(0.50 0.16 90)" },
    dark: { primary: "oklch(0.78 0.14 90)", ring: "oklch(0.73 0.14 90)", sidebarPrimary: "oklch(0.78 0.14 90)" },
  },
  {
    name: "lime",
    label: "Lime",
    swatch: "#84cc16",
    light: { primary: "oklch(0.53 0.14 130)", ring: "oklch(0.53 0.14 130)", sidebarPrimary: "oklch(0.48 0.14 130)" },
    dark: { primary: "oklch(0.75 0.14 130)", ring: "oklch(0.70 0.14 130)", sidebarPrimary: "oklch(0.75 0.14 130)" },
  },
  {
    name: "green",
    label: "Green",
    swatch: "#22c55e",
    light: { primary: "oklch(0.52 0.14 155)", ring: "oklch(0.52 0.14 155)", sidebarPrimary: "oklch(0.47 0.14 155)" },
    dark: { primary: "oklch(0.72 0.14 155)", ring: "oklch(0.68 0.14 155)", sidebarPrimary: "oklch(0.72 0.14 155)" },
  },
  {
    name: "emerald",
    label: "Emerald",
    swatch: "#10b981",
    light: { primary: "oklch(0.52 0.12 168)", ring: "oklch(0.52 0.12 168)", sidebarPrimary: "oklch(0.47 0.12 168)" },
    dark: { primary: "oklch(0.72 0.12 168)", ring: "oklch(0.68 0.12 168)", sidebarPrimary: "oklch(0.72 0.12 168)" },
  },
  {
    name: "teal",
    label: "Teal",
    swatch: "#14b8a6",
    light: { primary: "oklch(0.55 0.12 185)", ring: "oklch(0.55 0.12 185)", sidebarPrimary: "oklch(0.50 0.14 185)" },
    dark: { primary: "oklch(0.72 0.14 185)", ring: "oklch(0.65 0.12 185)", sidebarPrimary: "oklch(0.72 0.14 185)" },
  },
  {
    name: "cyan",
    label: "Cyan",
    swatch: "#06b6d4",
    light: { primary: "oklch(0.55 0.12 200)", ring: "oklch(0.55 0.12 200)", sidebarPrimary: "oklch(0.50 0.14 200)" },
    dark: { primary: "oklch(0.72 0.14 200)", ring: "oklch(0.68 0.12 200)", sidebarPrimary: "oklch(0.72 0.14 200)" },
  },
  {
    name: "sky",
    label: "Sky",
    swatch: "#0ea5e9",
    light: { primary: "oklch(0.55 0.14 225)", ring: "oklch(0.55 0.14 225)", sidebarPrimary: "oklch(0.50 0.16 225)" },
    dark: { primary: "oklch(0.72 0.14 225)", ring: "oklch(0.68 0.14 225)", sidebarPrimary: "oklch(0.72 0.14 225)" },
  },
  {
    name: "blue",
    label: "Blue",
    swatch: "#3b82f6",
    light: { primary: "oklch(0.55 0.18 250)", ring: "oklch(0.55 0.18 250)", sidebarPrimary: "oklch(0.50 0.18 250)" },
    dark: { primary: "oklch(0.70 0.15 250)", ring: "oklch(0.65 0.15 250)", sidebarPrimary: "oklch(0.70 0.15 250)" },
  },
  {
    name: "indigo",
    label: "Indigo",
    swatch: "#6366f1",
    light: { primary: "oklch(0.55 0.18 270)", ring: "oklch(0.55 0.18 270)", sidebarPrimary: "oklch(0.50 0.18 270)" },
    dark: { primary: "oklch(0.70 0.15 270)", ring: "oklch(0.65 0.15 270)", sidebarPrimary: "oklch(0.70 0.15 270)" },
  },
  {
    name: "violet",
    label: "Violet",
    swatch: "#8b5cf6",
    light: { primary: "oklch(0.55 0.18 290)", ring: "oklch(0.55 0.18 290)", sidebarPrimary: "oklch(0.50 0.18 290)" },
    dark: { primary: "oklch(0.70 0.15 290)", ring: "oklch(0.65 0.15 290)", sidebarPrimary: "oklch(0.70 0.15 290)" },
  },
  {
    name: "purple",
    label: "Purple",
    swatch: "#a855f7",
    light: { primary: "oklch(0.55 0.18 300)", ring: "oklch(0.55 0.18 300)", sidebarPrimary: "oklch(0.50 0.18 300)" },
    dark: { primary: "oklch(0.70 0.15 300)", ring: "oklch(0.65 0.15 300)", sidebarPrimary: "oklch(0.70 0.15 300)" },
  },
  {
    name: "fuchsia",
    label: "Fuchsia",
    swatch: "#d946ef",
    light: { primary: "oklch(0.55 0.20 320)", ring: "oklch(0.55 0.20 320)", sidebarPrimary: "oklch(0.50 0.20 320)" },
    dark: { primary: "oklch(0.72 0.16 320)", ring: "oklch(0.68 0.16 320)", sidebarPrimary: "oklch(0.72 0.16 320)" },
  },
  {
    name: "pink",
    label: "Pink",
    swatch: "#ec4899",
    light: { primary: "oklch(0.55 0.20 345)", ring: "oklch(0.55 0.20 345)", sidebarPrimary: "oklch(0.50 0.20 345)" },
    dark: { primary: "oklch(0.72 0.16 345)", ring: "oklch(0.68 0.16 345)", sidebarPrimary: "oklch(0.72 0.16 345)" },
  },
  {
    name: "rose",
    label: "Rose",
    swatch: "#f43f5e",
    light: { primary: "oklch(0.55 0.20 10)", ring: "oklch(0.55 0.20 10)", sidebarPrimary: "oklch(0.50 0.20 10)" },
    dark: { primary: "oklch(0.72 0.16 10)", ring: "oklch(0.68 0.16 10)", sidebarPrimary: "oklch(0.72 0.16 10)" },
  },
];

const STORAGE_KEY = "buget-accent";
const DEFAULT_ACCENT = "blue";

export function getStoredAccent(): string {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT;
}

export function setStoredAccent(name: string) {
  localStorage.setItem(STORAGE_KEY, name);
  applyAccent(name);
}

export function applyAccent(name?: string) {
  const accentName = name || getStoredAccent();
  const accent = ACCENT_COLORS.find((a) => a.name === accentName);
  if (!accent) return;

  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const vars = isDark ? accent.dark : accent.light;

  root.style.setProperty("--primary", vars.primary);
  root.style.setProperty("--ring", vars.ring);
  root.style.setProperty("--sidebar-primary", vars.sidebarPrimary);

  // Derived variables
  root.style.setProperty("--primary-foreground", isDark ? "oklch(0.15 0.02 0)" : "oklch(0.985 0 0)");
  root.style.setProperty("--sidebar-primary-foreground", isDark ? "oklch(0.15 0.02 0)" : "oklch(0.985 0 0)");
}
