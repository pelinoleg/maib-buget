import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, List, Upload, Tags, Wallet, Loader2, FileText, Moon, Sun, Sparkles, Settings2, Menu, X, ArrowUpDown, GitCompareArrows, Plus } from "lucide-react";
import { applyAccent } from "./lib/accent";
import Dashboard from "./components/Dashboard";
import TransactionList from "./components/TransactionList";
import UploadPDF from "./components/UploadPDF";
import CategoryManager from "./components/CategoryManager";
import AccountsSummary from "./components/AccountsSummary";
import TaxDeclaration from "./components/TaxDeclaration";
import AIAnalysis from "./components/AIAnalysis";
import Settings from "./components/Settings";
import CompareExpenses from "./components/CompareExpenses";
import ExchangeRates from "./components/ExchangeRates";
import BnmOfflineBanner from "./components/BnmOfflineBanner";
import AddTransaction from "./components/AddTransaction";
import UploadToast from "./components/UploadToast";
import { FilterSidebarProvider, useFilterSidebar } from "./components/FilterSidebar";
import { UploadProvider, useUpload } from "./lib/uploadContext";
import { getUploadCoverage } from "./lib/api";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Tablou de bord" },
  { to: "/transactions", icon: List, label: "Tranzacții" },
  { to: "/categories", icon: Tags, label: "Categorii" },
  { to: "/compare", icon: GitCompareArrows, label: "Comparare" },
];

const desktopMenuItems = [
  { to: "/upload", icon: Upload, label: "Încărcare PDF" },
  { to: "/accounts", icon: Wallet, label: "Conturi" },
  { to: "/rates", icon: ArrowUpDown, label: "Cursuri BNM" },
  { to: "/tax", icon: FileText, label: "Declarație fiscală" },
  { to: "/analysis", icon: Sparkles, label: "Analiză AI" },
  { to: "/settings", icon: Settings2, label: "Setări" },
];

/* Bottom tab bar items (mobile) — same as desktop nav + Menu */
const mobileTabItems = [
  { to: "/", icon: LayoutDashboard, label: "Tablou", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/15" },
  { to: "/transactions", icon: List, label: "Tranzacții", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/15" },
  { to: "/categories", icon: Tags, label: "Categorii", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/15" },
  { to: "/compare", icon: GitCompareArrows, label: "Comparare", color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/15" },
];

const mobileMenuItems = [
  { to: "/upload", icon: Upload, label: "Încărcare PDF", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/15" },
  { to: "/accounts", icon: Wallet, label: "Conturi", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/15" },
  { to: "/rates", icon: ArrowUpDown, label: "Cursuri BNM", color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/15" },
  { to: "/tax", icon: FileText, label: "Declarație fiscală", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/15" },
  { to: "/analysis", icon: Sparkles, label: "Analiză AI", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/15" },
  { to: "/settings", icon: Settings2, label: "Setări", color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-500/15" },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    // Re-apply accent colors for the new theme mode
    applyAccent();
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

function DesktopNav({ dark, toggle, hasWarnings }: { dark: boolean; toggle: () => void; hasWarnings: boolean }) {
  const { isUploading } = useUpload();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const isMenuRouteActive = desktopMenuItems.some((item) => location.pathname.startsWith(item.to));

  return (
    <nav className="border-b bg-card hidden md:block">
      <div className=" mx-auto flex items-center px-4 h-14 gap-1">

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}

        <div className="flex-1" />

        {/* Upload indicator when uploading */}
        {isUploading && (
          <NavLink to="/upload" className="p-2 text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
          </NavLink>
        )}

        {/* Coverage warning badge */}
        {hasWarnings && (
          <NavLink
            to="/settings"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-950/60 transition-colors text-xs font-medium"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Lipsesc extrase
          </NavLink>
        )}

        {/* Burger menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`p-2 rounded-md transition-colors ${
              menuOpen || isMenuRouteActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            title="Mai mult"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border bg-card shadow-lg py-1">
                {desktopMenuItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-foreground hover:bg-accent/50"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                    {item.to === "/settings" && hasWarnings && (
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse ml-auto" />
                    )}
                  </NavLink>
                ))}
                <div className="border-t my-1" />
                <button
                  onClick={() => { toggle(); setMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent/50 transition-colors w-full"
                >
                  {dark ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
                  {dark ? "Mod luminos" : "Mod întunecat"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function MobileBottomNav({ dark, toggle, hasWarnings }: { dark: boolean; toggle: () => void; hasWarnings: boolean }) {
  const { isUploading } = useUpload();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const isMenuRouteActive = mobileMenuItems.some((item) => {
    if (item.to === "/") return location.pathname === "/";
    return location.pathname.startsWith(item.to);
  });

  return (
    <>
      {/* Fullscreen menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden bg-background/95 backdrop-blur-sm flex flex-col" style={{ paddingTop: "var(--sat, 0px)" }}>
          <div className="flex-1 flex flex-col justify-center px-6 pb-20">
            <div className="space-y-2">
              {mobileMenuItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-4 px-4 py-3.5 rounded-xl text-base font-medium transition-colors ${
                      isActive
                        ? `${item.bg} ${item.color}`
                        : "text-foreground active:bg-accent"
                    }`
                  }
                >
                  {item.to === "/upload" && isUploading ? (
                    <Loader2 className={`h-6 w-6 animate-spin ${item.color}`} />
                  ) : (
                    <span className={`p-2 rounded-lg ${item.bg}`}>
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </span>
                  )}
                  {item.label}
                  {item.to === "/settings" && hasWarnings && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </NavLink>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between px-4">
              <span className="text-sm text-muted-foreground">Temă</span>
              <button onClick={toggle} className="p-2.5 rounded-lg bg-accent text-foreground">
                {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center justify-around h-14">
          {mobileTabItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 flex-1 text-[10px] font-medium transition-colors ${
                  isActive
                    ? item.color
                    : "text-muted-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`p-1 rounded-full transition-colors ${isActive ? item.bg : ""}`}>
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className={`truncate ${isActive ? "font-semibold" : ""}`}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 flex-1 text-[10px] font-medium transition-colors ${
              menuOpen || isMenuRouteActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <span className={`p-1 rounded-full transition-colors ${menuOpen || isMenuRouteActive ? "bg-primary/15" : ""}`}>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </span>
            <span className={menuOpen || isMenuRouteActive ? "font-semibold" : ""}>Mai mult</span>
            {!menuOpen && hasWarnings && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
        </div>
      </nav>
    </>
  );
}

function MainContent() {
  const { desktopOpen } = useFilterSidebar();
  return (
    <main className={`mx-auto px-4 py-6 pb-20 md:pb-6 safe-bottom transition-all duration-200 ${desktopOpen ? "max-w-[100rem]" : "max-w-7xl"}`}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<TransactionList />} />
        <Route path="/transactions/new" element={<AddTransaction />} />
        <Route path="/upload" element={<UploadPDF />} />
        <Route path="/categories" element={<CategoryManager />} />
        <Route path="/accounts" element={<AccountsSummary />} />
        <Route path="/tax" element={<TaxDeclaration />} />
        <Route path="/analysis" element={<AIAnalysis />} />
        <Route path="/compare" element={<CompareExpenses />} />
        <Route path="/rates" element={<ExchangeRates />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </main>
  );
}

function FloatingUploadButton() {
  const { isUploading } = useUpload();
  const location = useLocation();
  // Hide on upload page itself
  if (location.pathname === "/upload") return null;
  return (
    <NavLink
      to="/upload"
      className="fixed bottom-6 right-6 z-30 hidden md:flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      title="Încărcare PDF"
    >
      {isUploading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Plus className="h-5 w-5" />
      )}
    </NavLink>
  );
}

function AppShell() {
  const { dark, toggle } = useTheme();
  const [hasWarnings, setHasWarnings] = useState(false);

  useEffect(() => {
    getUploadCoverage()
      .then((data) => setHasWarnings(data.has_warnings))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <BnmOfflineBanner />
      <DesktopNav dark={dark} toggle={toggle} hasWarnings={hasWarnings} />
      <MainContent />
      <FloatingUploadButton />
      <MobileBottomNav dark={dark} toggle={toggle} hasWarnings={hasWarnings} />
      <UploadToast />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UploadProvider>
        <FilterSidebarProvider>
          <AppShell />
        </FilterSidebarProvider>
      </UploadProvider>
    </BrowserRouter>
  );
}
