import { useEffect, useRef, useCallback } from "react";

const THRESHOLD = 65;    // px to trigger refresh
const MAX_PULL = 90;     // max visual pull distance
const RESISTANCE = 0.45; // pull resistance factor

export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const startYRef = useRef<number | null>(null);
  const pullDistRef = useRef(0);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const refreshingRef = useRef(false);

  const getIndicator = useCallback((): HTMLDivElement => {
    if (!indicatorRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none;
        transition: opacity 0.2s;
        opacity: 0;
        height: 0px;
        overflow: hidden;
      `;
      el.innerHTML = `
        <div style="
          width: 32px; height: 32px; border-radius: 50%;
          background: hsl(var(--background)); border: 1px solid hsl(var(--border));
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.1s;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: hsl(var(--muted-foreground))">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </div>
      `;
      document.body.appendChild(el);
      indicatorRef.current = el;
    }
    return indicatorRef.current;
  }, []);

  const setIndicator = useCallback((dist: number, releasing = false) => {
    const el = getIndicator();
    const inner = el.firstElementChild as HTMLElement;
    if (dist <= 0) {
      el.style.opacity = "0";
      el.style.height = "0px";
      return;
    }
    const progress = Math.min(dist / THRESHOLD, 1);
    const h = Math.min(dist + 8, MAX_PULL + 8);
    el.style.height = `${h}px`;
    el.style.opacity = String(Math.min(progress * 1.5, 1));
    if (inner) {
      const spin = dist >= THRESHOLD;
      inner.style.transform = spin
        ? "rotate(0deg)"
        : `rotate(${progress * 180}deg)`;
      if (releasing || spin) {
        (inner.firstElementChild as HTMLElement).style.color = "hsl(var(--primary))";
      } else {
        (inner.firstElementChild as HTMLElement).style.color = "hsl(var(--muted-foreground))";
      }
    }
  }, [getIndicator]);

  const hideIndicator = useCallback(() => {
    const el = getIndicator();
    el.style.transition = "opacity 0.3s, height 0.3s";
    el.style.opacity = "0";
    el.style.height = "0px";
    setTimeout(() => {
      if (el.style.opacity === "0") el.style.transition = "";
    }, 300);
  }, [getIndicator]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      // Only start if at top of page
      if (window.scrollY > 2) return;
      startYRef.current = e.touches[0].clientY;
      pullDistRef.current = 0;
      const el = getIndicator();
      el.style.transition = "";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) { startYRef.current = null; return; }
      // Prevent default scroll bounce only while pulling
      if (window.scrollY <= 2) e.preventDefault();
      pullDistRef.current = Math.min(dy * RESISTANCE, MAX_PULL);
      setIndicator(pullDistRef.current);
    };

    const onTouchEnd = async () => {
      if (startYRef.current === null || refreshingRef.current) return;
      const dist = pullDistRef.current;
      startYRef.current = null;
      pullDistRef.current = 0;

      if (dist >= THRESHOLD) {
        refreshingRef.current = true;
        setIndicator(THRESHOLD, true);
        try { await onRefresh(); } catch {}
        refreshingRef.current = false;
      }
      hideIndicator();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      indicatorRef.current?.remove();
      indicatorRef.current = null;
    };
  }, [onRefresh, setIndicator, hideIndicator, getIndicator]);
}
