"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "camp-planner-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // SSR-safe initialization: keep all initial state false so server-rendered HTML
  // matches the first client render, then read localStorage / UA on mount.
  // The setState calls below intentionally trigger one re-render — they're the
  // canonical pattern for state derived from browser APIs (localStorage,
  // navigator, matchMedia) that aren't available during server rendering.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY) === "true") {
      setDismissed(true);
      return;
    }
    if (isStandalone()) {
      return;
    }
    if (isIosSafari()) {
      setShowIosHint(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
    setShowIosHint(false);
    setInstallEvent(null);
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallEvent(null);
    } else {
      handleDismiss();
    }
  };

  if (dismissed) return null;

  if (showIosHint) {
    return (
      <div className="flex items-center gap-2 text-xs text-camp-earth">
        <span className="whitespace-nowrap">Install: Share → Add to Home Screen</span>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install hint"
          className="text-camp-earth/70 hover:text-white"
        >
          ✕
        </button>
      </div>
    );
  }

  if (!installEvent) return null;

  return (
    <button
      onClick={handleInstall}
      className="text-xs bg-camp-forest hover:bg-camp-pine text-white font-medium py-1.5 px-3 rounded-lg transition-colors"
    >
      Install app
    </button>
  );
}
