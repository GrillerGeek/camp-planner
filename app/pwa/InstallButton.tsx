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
  // Derive initial values synchronously so no setState call is needed inside the effect.
  const [showIosHint, setShowIosHint] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem(DISMISS_KEY) === "true") return false;
    if (isStandalone()) return false;
    return isIosSafari();
  });
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) === "true";
  });

  useEffect(() => {
    // Already dismissed or running on iOS Safari (handled by showIosHint) — skip.
    if (dismissed || showIosHint || isStandalone()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed, showIosHint]);

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
      <div className="hidden sm:flex items-center gap-2 text-xs text-camp-earth">
        <span>Install: Share → Add to Home Screen</span>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install hint"
          className="text-camp-earth/60 hover:text-white"
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
