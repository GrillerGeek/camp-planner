"use client";

import { useEffect, useRef, useState } from "react";

// Standard PWA stale-version problem: when a new deploy ships, the browser
// only checks for a new sw.js on its own schedule (often ~24h). Even when
// the new SW activates (skipWaiting), the page currently rendered is still
// running the old JS. We detect new-SW activations via `controllerchange`
// and prompt the user to reload — and actively call `registration.update()`
// on visibility change so a backgrounded tab doesn't sit on stale code.
//
// On reload, we also delete `trip-pages` so the user's first navigation
// goes to network instead of SWR'ing the old cached HTML.

export function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);

  // Whether the page initially loaded already under SW control. If true,
  // the FIRST controllerchange we see represents a new SW (an update).
  // If false (uncontrolled initial load), the first controllerchange is
  // just the SW claiming this page and is NOT an update.
  const initiallyHadController = useRef(false);
  const firstChangeSeen = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    initiallyHadController.current = navigator.serviceWorker.controller !== null;

    const onControllerChange = () => {
      if (!initiallyHadController.current && !firstChangeSeen.current) {
        firstChangeSeen.current = true;
        return;
      }
      setUpdateReady(true);
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    // Actively poll for a new SW version on focus / visibility change. Catches
    // tabs that have been backgrounded longer than the browser's auto-check.
    const checkForUpdate = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      } catch {
        // Network failure or SW not yet ready — try again next visibility tick.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);

    void checkForUpdate();

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleReload = async () => {
    // Clear trip-pages so the post-reload navigation goes to network for fresh
    // HTML/RSC instead of SWR'ing the old cached version. trip-pages is the
    // only cache we wrote ourselves; defaultCache's buckets (pages-rsc etc.)
    // also need clearing if we want truly fresh page payloads.
    if (typeof caches !== "undefined") {
      await Promise.allSettled([
        caches.delete("trip-pages"),
        caches.delete("pages-rsc"),
        caches.delete("pages-rsc-prefetch"),
        caches.delete("pages"),
      ]);
    }
    window.location.reload();
  };

  if (!updateReady) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] bg-camp-forest text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-3 shadow-md"
    >
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={handleReload}
        className="bg-white/20 hover:bg-white/30 text-white font-medium py-1 px-3 rounded transition-colors"
      >
        Reload
      </button>
    </div>
  );
}
