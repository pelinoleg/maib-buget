export interface SubCategory {
  id: number;
  name: string;
  color: string;
  transaction_count: number;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  icon: string | null;
  transaction_count: number;
  subcategories: SubCategory[];
}

export interface Rule {
  id: number;
  pattern: string;
  category_id: number;
  category_name: string;
  match_type?: string; // "contains" or "regex"
  source_example?: string;
  match_count?: number;
}

export interface SampleTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: string;
}

export interface TypeRuleData {
  id: number;
  pattern: string;
  match_type: string;
  target_type: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  priority: number;
  match_count: number;
}

export const COLORS = [
  // Red
  "#fca5a5", "#ef4444", "#b91c1c",
  // Orange
  "#fdba74", "#f97316", "#c2410c",
  // Yellow / Amber
  "#fde047", "#eab308", "#d97706",
  // Green
  "#86efac", "#22c55e", "#15803d",
  // Teal / Cyan
  "#5eead4", "#14b8a6", "#06b6d4",
  // Blue
  "#93c5fd", "#3b82f6", "#1d4ed8",
  // Indigo / Violet
  "#a5b4fc", "#6366f1", "#8b5cf6",
  // Purple / Pink
  "#d8b4fe", "#a855f7", "#ec4899",
  // Neutral
  "#94a3b8", "#64748b", "#475569",
];
