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
// handoffs, and page transitions. We debounce the going-offline transition by
// 3 seconds so transient blips don't flash the banner. Coming back online
// flips immediately — no point holding the user at "offline" longer than
// necessary once connectivity returns.
const OFFLINE_DEBOUNCE_MS = 3000;

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
        // with navigator.onLine before committing the state change.
        if (!navigator.onLine) setIsOffline(true);
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
