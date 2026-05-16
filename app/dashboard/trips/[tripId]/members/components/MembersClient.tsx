"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type TripMemberDetailed,
  findProfileByEmail,
  addTripMember,
  updateMemberRole,
  removeMember,
  getTripMembersDetailed,
} from "@/lib/queries/trips";

interface MembersClientProps {
  tripId: string;
  isPlanner: boolean;
  initialMembers: TripMemberDetailed[];
}

type Lookup =
  | { state: "idle" }
  | { state: "searching" }
  | {
      state: "found";
      profile: {
        id: string;
        display_name: string;
        email: string;
        avatar_url: string | null;
      };
    }
  | { state: "not_found"; email: string }
  | { state: "error"; message: string };

export function MembersClient({
  tripId,
  isPlanner,
  initialMembers,
}: MembersClientProps) {
  const [members, setMembers] =
    useState<TripMemberDetailed[]>(initialMembers);
  const [emailInput, setEmailInput] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [pickRole, setPickRole] = useState<"planner" | "viewer">("planner");
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const supabase = createClient();

  const refresh = useCallback(async () => {
    try {
      const fresh = await getTripMembersDetailed(supabase, tripId);
      setMembers(fresh);
    } catch {
      // ignore — realtime is best-effort, page refresh will fix
    }
  }, [supabase, tripId]);

  useEffect(() => {
    const channel = supabase
      .channel(`trip_members:${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_members",
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tripId, refresh]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    setActionError(null);
    setLookup({ state: "searching" });
    try {
      const profile = await findProfileByEmail(supabase, email);
      if (!profile) {
        setLookup({ state: "not_found", email });
      } else if (members.some((m) => m.user_id === profile.id)) {
        setLookup({
          state: "error",
          message: `${profile.display_name} is already a member.`,
        });
      } else {
        setLookup({ state: "found", profile });
      }
    } catch (err) {
      setLookup({
        state: "error",
        message: err instanceof Error ? err.message : "Lookup failed.",
      });
    }
  }

  async function handleConfirmAdd() {
    if (lookup.state !== "found") return;
    setActionError(null);
    try {
      await addTripMember(supabase, tripId, lookup.profile.id, pickRole);
      setEmailInput("");
      setLookup({ state: "idle" });
      setPickRole("planner");
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to add member."
      );
    }
  }

  async function handleRoleChange(
    member: TripMemberDetailed,
    nextRole: "planner" | "viewer"
  ) {
    if (member.role === nextRole) return;
    setBusyMemberId(member.id);
    setActionError(null);
    try {
      await updateMemberRole(supabase, member.id, nextRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: nextRole } : m))
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to change role."
      );
    } finally {
      setBusyMemberId(null);
    }
  }

  async function handleRemove(member: TripMemberDetailed) {
    if (member.is_creator) return;
    if (
      !confirm(
        `Remove ${member.display_name} from this trip? They will lose all access.`
      )
    ) {
      return;
    }
    setBusyMemberId(member.id);
    setActionError(null);
    try {
      await removeMember(supabase, member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to remove member."
      );
    } finally {
      setBusyMemberId(null);
    }
  }

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <div className="space-y-6">
      {/* Members list */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <ul className="divide-y divide-white/10">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              {m.avatar_url ? (
                <img
                  src={m.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-camp-forest/40 flex items-center justify-center text-white text-sm font-medium">
                  {initials(m.display_name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium truncate">
                    {m.display_name}
                  </span>
                  {m.is_creator && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-camp-fire/15 text-camp-fire border border-camp-fire/30">
                      Creator
                    </span>
                  )}
                </div>
                <div className="text-camp-earth/60 text-xs truncate">
                  {m.email}
                </div>
              </div>

              {isPlanner && !m.is_creator ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      handleRoleChange(
                        m,
                        e.target.value as "planner" | "viewer"
                      )
                    }
                    disabled={busyMemberId === m.id}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-camp-forest/50 disabled:opacity-50"
                  >
                    <option value="planner">Planner</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleRemove(m)}
                    disabled={busyMemberId === m.id}
                    className="text-red-400/70 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="text-camp-earth/80 text-xs capitalize px-2 py-1 rounded bg-white/5 border border-white/10 shrink-0">
                  {m.role}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {actionError && (
        <div className="text-red-400 text-sm">{actionError}</div>
      )}

      {/* Add member form */}
      {isPlanner && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h2 className="text-white font-medium mb-3">Add a member</h2>

          {lookup.state !== "found" ? (
            <form
              onSubmit={handleLookup}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Email address"
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                required
              />
              <button
                type="submit"
                disabled={lookup.state === "searching" || !emailInput.trim()}
                className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
              >
                {lookup.state === "searching" ? "Looking up..." : "Look up"}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                {lookup.profile.avatar_url ? (
                  <img
                    src={lookup.profile.avatar_url}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-camp-forest/40 flex items-center justify-center text-white text-xs font-medium">
                    {initials(lookup.profile.display_name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">
                    {lookup.profile.display_name}
                  </div>
                  <div className="text-camp-earth/60 text-xs truncate">
                    {lookup.profile.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-camp-earth text-sm">Role:</label>
                <select
                  value={pickRole}
                  onChange={(e) =>
                    setPickRole(e.target.value as "planner" | "viewer")
                  }
                  className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                >
                  <option value="planner">
                    Planner (full edit access)
                  </option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => {
                      setLookup({ state: "idle" });
                      setEmailInput("");
                    }}
                    className="text-camp-earth/60 hover:text-white text-sm py-1.5 px-3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAdd}
                    className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                  >
                    Add to trip
                  </button>
                </div>
              </div>
            </div>
          )}

          {lookup.state === "not_found" && (
            <p className="mt-3 text-camp-earth/70 text-sm">
              No user found with <span className="text-white">{lookup.email}</span>.
              They need to sign in to Camp Planner with Google at least once
              before you can add them.
            </p>
          )}

          {lookup.state === "error" && (
            <p className="mt-3 text-red-400 text-sm">{lookup.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
