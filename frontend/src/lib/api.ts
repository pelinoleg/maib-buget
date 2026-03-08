export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, options);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
      else if (body.detail) message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch { /* ignore parse errors */ }
    throw new Error(message);
  }
  return res.json();
}

// Uploads
export function uploadPDF(file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetchJSON("/uploads", { method: "POST", body: form });
}

export function getUploads() {
  return fetchJSON("/uploads");
}

// Transactions
export function getTransactions(params: Record<string, string | number | boolean> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/transactions?${qs}`);
}

export function updateTransaction(id: number, data: Record<string, unknown>) {
  return fetchJSON(`/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateTransactionCategory(id: number, categoryId: number | null) {
  const qs = categoryId !== null ? `?category_id=${categoryId}` : "";
  return fetchJSON(`/transactions/${id}/category${qs}`, { method: "PATCH" });
}

export function updateTransactionType(id: number, type: string) {
  return fetchJSON(`/transactions/${id}/type?type=${type}`, { method: "PATCH" });
}

export function updateTransactionNote(id: number, note: string | null) {
  return fetchJSON(`/transactions/${id}/note`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

export function createTransaction(data: {
  account_id: number;
  transaction_date: string;
  description: string;
  amount: number;
  type: string;
  processing_date?: string | null;
  category_id?: number | null;
  original_amount?: number | null;
  original_currency?: string | null;
  commission?: number;
  note?: string | null;
}) {
  return fetchJSON("/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteTransaction(id: number) {
  return fetchJSON(`/transactions/${id}`, { method: "DELETE" });
}

export function deleteTransactionsBulk(ids: number[]) {
  return fetchJSON("/transactions/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export function splitTransaction(id: number, data: { description: string; amount: number; type?: string; category_id?: number | null; note?: string | null }) {
  return fetchJSON(`/transactions/${id}/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Categories
export function getCategories() {
  return fetchJSON("/categories");
}

export function createCategory(data: { name: string; parent_id?: number | null; color?: string; icon?: string }) {
  return fetchJSON("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateCategory(id: number, data: { name?: string; color?: string; parent_id?: number | null }) {
  return fetchJSON(`/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: number) {
  return fetchJSON(`/categories/${id}`, { method: "DELETE" });
}

export function getCategoryRules() {
  return fetchJSON("/categories/rules");
}

export function createCategoryRule(data: { pattern: string; category_id: number; match_type?: string }) {
  return fetchJSON("/categories/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateCategoryRule(id: number, data: { pattern?: string; category_id?: number; match_type?: string }) {
  return fetchJSON(`/categories/rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteCategoryRule(id: number) {
  return fetchJSON(`/categories/rules/${id}`, { method: "DELETE" });
}

export function getPendingRules() {
  return fetchJSON("/categories/rules/pending");
}

export function getRuleSampleTransactions(ruleId: number) {
  return fetchJSON(`/categories/rules/${ruleId}/sample-transactions`);
}

export function approveRule(id: number) {
  return fetchJSON(`/categories/rules/${id}/approve`, { method: "POST" });
}

export function approveRulesBulk(ids: number[]) {
  return fetchJSON("/categories/rules/approve-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export function mergeRules(ids: number[], pattern: string, category_id: number) {
  return fetchJSON("/categories/rules/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, pattern, category_id }),
  });
}

// Accounts
export function getAccounts() {
  return fetchJSON("/accounts");
}

export function createAccount(data: { account_number: string; currency: string; name?: string; description?: string; bank?: string; iban?: string; account_type?: string; is_monitored?: boolean }) {
  return fetchJSON("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateAccount(id: number, data: { name?: string; description?: string; bank?: string; iban?: string; currency?: string; account_type?: string; is_monitored?: boolean }) {
  return fetchJSON(`/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteAccount(id: number) {
  return fetchJSON(`/accounts/${id}`, { method: "DELETE" });
}

// Dashboard
export function getDashboardSummary(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/summary?${qs}`);
}

export function getExpensesByCategory(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/by-category?${qs}`);
}

export function getIncomeExpenseByMonth(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/by-month?${qs}`);
}

export function getTopExpenses(params: Record<string, string | number> = {}, excludeCategories: string[] = []) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  for (const cat of excludeCategories) qs.append("exclude_categories", cat);
  return fetchJSON(`/dashboard/top-expenses?${qs}`);
}

export function getBalanceTrend(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/balance-trend?${qs}`);
}

export function getRecurring(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/recurring?${qs}`);
}

export function getCategoryTrend(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/category-trend?${qs}`);
}

export function compareCategories(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/compare-categories?${qs}`);
}

export function getSuspectDuplicates(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/dashboard/suspect-duplicates?${qs}`);
}

// Saved Filters
export function getSavedFilters() {
  return fetchJSON("/saved-filters");
}

export function createSavedFilter(data: {
  name: string;
  period_preset?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  account_id?: number | null;
  category_id?: number | null;
  type?: string | null;
  search?: string | null;
}) {
  return fetchJSON("/saved-filters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateSavedFilter(id: number, data: Record<string, unknown>) {
  return fetchJSON(`/saved-filters/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteSavedFilter(id: number) {
  return fetchJSON(`/saved-filters/${id}`, { method: "DELETE" });
}

// Tax Declaration
export function getTaxIncome(year: number) {
  return fetchJSON(`/tax/income?year=${year}`);
}

export function getTaxConfig() {
  return fetchJSON("/tax/config");
}

export function convertTaxIncome(year: number) {
  return fetchJSON("/tax/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year }),
  });
}

// Type Rules
export function getTypeRules() {
  return fetchJSON("/type-rules");
}

export function createTypeRule(data: { pattern: string; match_type: string; target_type: string; description?: string; priority?: number }) {
  return fetchJSON("/type-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateTypeRule(id: number, data: { pattern?: string; match_type?: string; target_type?: string; description?: string; is_active?: boolean; priority?: number }) {
  return fetchJSON(`/type-rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteTypeRule(id: number) {
  return fetchJSON(`/type-rules/${id}`, { method: "DELETE" });
}

export function reapplyTypeRules() {
  return fetchJSON("/type-rules/reapply", { method: "POST" });
}

// AI Analysis
export function analyzeWithAI(params: Record<string, string | number>) {
  return fetchJSON("/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

// Settings
export function getUploadCoverage() {
  return fetchJSON("/settings/upload-coverage");
}

export function getAIPrompt() {
  return fetchJSON("/settings/ai-prompt");
}

export function saveAIPrompt(data: { system_message: string; user_prompt_template: string }) {
  return fetchJSON("/settings/ai-prompt", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function resetAIPrompt() {
  return fetchJSON("/settings/ai-prompt", { method: "DELETE" });
}

// Dev
export function resetDatabase() {
  return fetchJSON("/reset-database", { method: "POST" });
}

// BNM Exchange Rates
export function getExchangeRates(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return fetchJSON(`/settings/exchange-rates?${qs}`);
}

export function syncExchangeRates(data: { date_from?: string; date_to?: string; currencies?: string[] } = {}) {
  return fetchJSON("/settings/exchange-rates/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function getExchangeRatesSummary() {
  return fetchJSON("/settings/exchange-rates/summary");
}

export function checkTomorrowRates(): Promise<{
  available: boolean;
  date?: string;
  rates?: Record<string, { rate: number; delta: number | null }>;
}> {
  return fetchJSON("/settings/exchange-rates/tomorrow");
}

// Categorization
export function applyRules() {
  return fetchJSON("/categorize/apply-rules", { method: "POST" });
}

export function reapplyAllRules() {
  return fetchJSON("/categorize/reapply-all", { method: "POST" });
}

export function refreshAICategorization() {
  return fetchJSON("/categorize/refresh-ai", { method: "POST" });
}
