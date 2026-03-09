import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

const LS_KEY = "filter-sidebar-open";

/* ── Media query hook ── */

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/* ── Shared context for desktop sidebar state ── */

interface FilterSidebarContextType {
  desktopOpen: boolean;
  setDesktopOpen: (open: boolean) => void;
}

const FilterSidebarContext = createContext<FilterSidebarContextType>({
  desktopOpen: false,
  setDesktopOpen: () => {},
});

export function FilterSidebarProvider({ children }: { children: ReactNode }) {
  const [desktopOpen, setDesktopOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(LS_KEY);
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(LS_KEY, String(desktopOpen));
  }, [desktopOpen]);

  return (
    <FilterSidebarContext.Provider value={{ desktopOpen, setDesktopOpen }}>
      {children}
    </FilterSidebarContext.Provider>
  );
}

export function useFilterSidebar() {
  return useContext(FilterSidebarContext);
}

/* ── Toggle button + mobile Sheet ── */

interface FilterToggleProps {
  activeFilterCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  activeChips?: ReactNode;
}

export default function FilterSidebar({ children, activeFilterCount, open, onOpenChange, activeChips }: FilterToggleProps) {
  const { desktopOpen, setDesktopOpen } = useFilterSidebar();
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    // Desktop: only toggle button, panel rendered separately by FilterPanel
    return (
      <Button
        variant={desktopOpen ? "default" : "outline"}
        size="sm"
        className="gap-1.5 h-8"
        onClick={() => setDesktopOpen(!desktopOpen)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtre
        {activeFilterCount > 0 && (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
            desktopOpen ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
          }`}>{activeFilterCount}</span>
        )}
      </Button>
    );
  }

  // Mobile: Sheet overlay
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8">
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">{activeFilterCount}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-[380px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filtre</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pt-2 pb-4">
          {activeChips && <div className="flex items-center gap-1.5 flex-wrap">{activeChips}</div>}
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Desktop panel (renders as flex sibling of main content) ── */

export function FilterPanel({ children, activeChips }: { children: ReactNode; activeChips?: ReactNode }) {
  const { desktopOpen, setDesktopOpen } = useFilterSidebar();
  const isDesktop = useIsDesktop();

  if (!isDesktop || !desktopOpen) return null;

  return (
    <aside className="w-[322px] shrink-0 self-start sticky top-4">
      <div className="border rounded-lg bg-card max-h-[calc(100vh-3rem)] flex flex-col">
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <span className="text-sm font-semibold">Filtre</span>
          <button onClick={() => setDesktopOpen(false)} className="p-1 rounded-md hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 space-y-4">
          {activeChips && <div className="flex items-center gap-1.5 flex-wrap">{activeChips}</div>}
          {children}
        </div>
      </div>
    </aside>
  );
}
