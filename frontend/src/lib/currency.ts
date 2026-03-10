const CURRENCY_MAP: Record<string, { symbol: string; color: string }> = {
  EUR: { symbol: "€", color: "#003399" },     // EU blue
  USD: { symbol: "$", color: "#2e7d32" },      // US green
  MDL: { symbol: "L", color: "#d32f2f" },      // Moldova red
  GBP: { symbol: "£", color: "#4a148c" },      // Royal purple
  RON: { symbol: "lei", color: "#1565c0" },    // Romania blue
  CHF: { symbol: "Fr", color: "#c62828" },     // Swiss red
  PLN: { symbol: "zł", color: "#d84315" },     // Poland orange-red
  UAH: { symbol: "₴", color: "#1976d2" },      // Ukraine blue
  RUB: { symbol: "₽", color: "#b71c1c" },      // Russia red
  TRY: { symbol: "₺", color: "#c62828" },      // Turkey red
  JPY: { symbol: "¥", color: "#ad1457" },      // Japan
  CNY: { symbol: "¥", color: "#c62828" },      // China red
  CZK: { symbol: "Kč", color: "#1565c0" },     // Czech blue
  SEK: { symbol: "kr", color: "#0d47a1" },     // Sweden blue
  NOK: { symbol: "kr", color: "#b71c1c" },     // Norway red
  DKK: { symbol: "kr", color: "#c62828" },     // Denmark red
  HUF: { symbol: "Ft", color: "#2e7d32" },     // Hungary green
  BGN: { symbol: "лв", color: "#2e7d32" },     // Bulgaria green
};

export function currencySymbol(code: string): string {
  return CURRENCY_MAP[code.toUpperCase()]?.symbol ?? code;
}

export function currencyColor(code: string): string {
  return CURRENCY_MAP[code.toUpperCase()]?.color ?? "#64748b";
}
