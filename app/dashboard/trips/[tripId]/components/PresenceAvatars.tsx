"use client";

import { usePresence, type PresenceUser } from "@/lib/realtime/usePresence";

const MAX_VISIBLE = 5;

/**
 * Derives a consistent color from a user_id hash.
 */
function getColorFromId(userId: string): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-yellow-500",
    "bg-red-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Extracts initials from a display name (up to 2 characters).
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface PresenceAvatarsProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export function PresenceAvatars({
  userId,
  displayName,
  avatarUrl,
}: PresenceAvatarsProps) {
  const { presentUsers } = usePresence({
    userId,
    displayName,
    avatarUrl,
  });

  if (presentUsers.length === 0) return null;

  const visible = presentUsers.slice(0, MAX_VISIBLE);
  const overflow = presentUsers.length - MAX_VISIBLE;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((user) => (
        <AvatarBubble key={user.user_id} user={user} />
      ))}
      {overflow > 0 && (
        <div className="relative w-8 h-8 rounded-full bg-white/20 border-2 border-camp-night flex items-center justify-center">
          <span className="text-white text-xs font-medium">+{overflow}</span>
        </div>
      )}
    </div>
  );
}

function AvatarBubble({ user }: { user: PresenceUser }) {
  return (
    <div className="relative group" title={user.display_name}>
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.display_name}
          className="w-8 h-8 rounded-full border-2 border-camp-night object-cover"
        />
      ) : (
        <div
          className={`w-8 h-8 rounded-full border-2 border-camp-night flex items-center justify-center ${getColorFromId(user.user_id)}`}
        >
          <span className="text-white text-xs font-medium">
            {getInitials(user.display_name)}
          </span>
        </div>
      )}
      {/* Green online indicator */}
      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-camp-night rounded-full" />
      {/* Tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/80 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {user.display_name}
      </span>
    </div>
  );
}
