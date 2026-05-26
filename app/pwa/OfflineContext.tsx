"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface OfflineContextValue {
  isOffline: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({ isOffline: false });

// navigator.onLine flips spuriously on mobile during Wi-Fi sleep, cell-tower
// handoffs, and page transitions. iOS Safari in particular flips it false for
// several seconds even on rock-solid Wi-Fi when the page rehydrates or a new
// tab takes focus. We debounce going-offline by 8 seconds AND, when the
// debounce fires, double-check via the Network Information API if available
// before committing to "offline". Coming back online flips immediately.
const OFFLINE_DEBOUNCE_MS = 8000;

// Network Information API (mobile Chrome, modern Safari). Returns null when
// the API isn't available so callers can fall back.
function networkConnectionLooksOffline(): boolean | null {
  if (typeof navigator === "undefined") return null;
  const conn = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string } }).connection;
  if (!conn) return null;
  if (conn.type === "none") return true;
  if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") {
    // Very slow but not necessarily offline. Don't flip the banner solely
    // on this signal — return null to defer to navigator.onLine.
    return null;
  }
  return false;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const offlineTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearPending = () => {
      if (offlineTimerRef.current !== null) {
        window.clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };

    const handleOffline = () => {
      clearPending();
      offlineTimerRef.current = window.setTimeout(() => {
        // Re-check at fire time. Some browsers don't fire 'online' when
        // connectivity returns during the debounce window, so we verify
        // with navigator.onLine. Additionally cross-check the Network
        // Information API when available — if THAT says we have a connection,
        // trust it over the noisy onLine signal.
        const connectionVerdict = networkConnectionLooksOffline();
        const navigatorSaysOffline = !navigator.onLine;
        const reallyOffline =
          connectionVerdict === true ||
          (connectionVerdict === null && navigatorSaysOffline);
        if (reallyOffline) setIsOffline(true);
        offlineTimerRef.current = null;
      }, OFFLINE_DEBOUNCE_MS);
    };

    const handleOnline = () => {
      clearPending();
      setIsOffline(false);
    };

    // Initial sync: if we mount already offline, schedule the debounce
    // rather than flashing the banner immediately.
    if (!navigator.onLine) {
      handleOffline();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearPending();
    };
  }, []);

  return (
    <OfflineContext.Provider value={{ isOffline }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useIsOffline(): boolean {
  return useContext(OfflineContext).isOffline;
}
