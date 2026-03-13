const KEY = "summary_prefs";

export type SummaryBlock = "income" | "expense" | "refunds" | "transfers";

export interface SummaryPrefs {
  visible: Record<SummaryBlock, boolean>;
}

const DEFAULTS: SummaryPrefs = {
  visible: { income: true, expense: true, refunds: false, transfers: false },
};

export function getSummaryPrefs(): SummaryPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { visible: { ...DEFAULTS.visible, ...parsed.visible } };
  } catch {
    return DEFAULTS;
  }
}

export function setSummaryPrefs(prefs: SummaryPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
}
