"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface OfflineContextValue {
  isOffline: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({ isOffline: false });

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
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
