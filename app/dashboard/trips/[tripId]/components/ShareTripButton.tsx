"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { TripShareLink } from "@/lib/types/sharing";
import {
  createShareLink,
  getShareLinksForTrip,
  revokeShareLink,
} from "@/lib/queries/sharing";

interface ShareTripButtonProps {
  tripId: string;
}

interface FreshLink {
  linkId: string;
  plaintext: string;
}

export function ShareTripButton({ tripId }: ShareTripButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [links, setLinks] = useState<TripShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Plaintext tokens are only available for links generated this session.
  // We intentionally do not persist them — the server only stores the hash.
  const [freshTokens, setFreshTokens] = useState<Map<string, string>>(
    new Map()
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const supabase = createClient();

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getShareLinksForTrip(supabase, tripId);
      setLinks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  }, [supabase, tripId]);

  useEffect(() => {
    if (isOpen) {
      loadLinks();
    }
  }, [isOpen, loadLinks]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const { plaintext } = await createShareLink(supabase, tripId);
      // Reload the list to get the new row's id + created_at metadata
      const refreshed = await getShareLinksForTrip(supabase, tripId);
      setLinks(refreshed);
      // Match the newest non-revoked link — it's the one we just made
      const newest = refreshed
        .filter((l) => !l.revoked_at)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )[0];
      if (newest) {
        setFreshTokens((prev) => {
          const next = new Map(prev);
          next.set(newest.id, plaintext);
          return next;
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate share link"
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(linkId: string) {
    setError(null);
    try {
      await revokeShareLink(supabase, linkId, tripId);
      setLinks((prev) =>
        prev.map((l) =>
          l.id === linkId ? { ...l, revoked_at: new Date().toISOString() } : l
        )
      );
      setFreshTokens((prev) => {
        const next = new Map(prev);
        next.delete(linkId);
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to revoke share link"
      );
    }
  }

  function getShareUrl(plaintext: string) {
    return `${window.location.origin}/shared/${plaintext}`;
  }

  async function handleCopy(linkId: string, plaintext: string) {
    try {
      await navigator.clipboard.writeText(getShareUrl(plaintext));
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Clipboard unavailable — long-press to copy the URL manually");
    }
  }

  const activeLinks = links.filter((l) => !l.revoked_at);
  const revokedLinks = links.filter((l) => l.revoked_at);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-camp-earth hover:text-white text-sm font-medium py-2 px-3 rounded-lg hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
          />
        </svg>
        Share
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative bg-camp-night border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Share Trip</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-camp-earth hover:text-white transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <p className="text-camp-earth text-sm mb-4">
                Generate a view-only link to share this trip with guests. The
                URL is shown <strong>only at creation time</strong> — if you
                lose it, revoke this link and generate a new one.
              </p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
              >
                {generating ? "Generating..." : "Generate New Link"}
              </button>

              {loading ? (
                <div className="text-center py-4">
                  <div className="text-camp-earth text-sm">Loading links...</div>
                </div>
              ) : (
                <>
                  {activeLinks.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-white mb-3">
                        Active Links
                      </h3>
                      <div className="space-y-3">
                        {activeLinks.map((link) => {
                          const plaintext = freshTokens.get(link.id);
                          return (
                            <div
                              key={link.id}
                              className="bg-white/5 border border-white/10 rounded-lg p-3"
                            >
                              {plaintext ? (
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="flex-1 bg-black/20 rounded px-3 py-1.5 text-xs text-camp-earth font-mono truncate">
                                    {getShareUrl(plaintext)}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-camp-earth/50 mb-2">
                                  URL hidden — generate a new link to get a
                                  shareable URL.
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-camp-earth/60">
                                  Created{" "}
                                  {new Date(
                                    link.created_at
                                  ).toLocaleDateString()}
                                </span>
                                <div className="flex items-center gap-2">
                                  {plaintext && (
                                    <button
                                      onClick={() =>
                                        handleCopy(link.id, plaintext)
                                      }
                                      className="text-xs text-camp-sky hover:text-white font-medium transition-colors"
                                    >
                                      {copiedId === link.id ? "Copied!" : "Copy"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRevoke(link.id)}
                                    className="text-xs text-camp-fire hover:text-red-400 font-medium transition-colors"
                                  >
                                    Revoke
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {revokedLinks.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-camp-earth/60 mb-3">
                        Revoked Links
                      </h3>
                      <div className="space-y-2">
                        {revokedLinks.map((link) => (
                          <div
                            key={link.id}
                            className="bg-white/5 border border-white/5 rounded-lg p-3 opacity-50"
                          >
                            <span className="text-xs text-camp-earth/40">
                              Revoked{" "}
                              {new Date(link.revoked_at!).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {links.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-camp-earth/60 text-sm">
                        No share links yet. Generate one above.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
