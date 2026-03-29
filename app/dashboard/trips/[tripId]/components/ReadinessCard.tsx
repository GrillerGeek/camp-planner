"use client";

import Link from "next/link";

interface ReadinessCardProps {
  title: string;
  icon: string;
  status: "empty" | "in_progress" | "complete";
  percentage: number;
  emptyMessage: string;
  href?: string;
  detail?: string;
}

export function ReadinessCard({
  title,
  icon,
  status,
  percentage,
  emptyMessage,
  href,
  detail,
}: ReadinessCardProps) {
  const content = (
    <>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xl">{icon}</span>
        <h3 className="text-white font-medium">{title}</h3>
        {href && (
          <svg
            className="w-4 h-4 text-camp-earth/40 ml-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
        )}
      </div>

      <div className="w-full bg-white/10 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${
            status === "complete"
              ? "bg-camp-forest"
              : status === "in_progress"
              ? "bg-camp-sky"
              : "bg-white/5"
          }`}
          style={{ width: `${Math.max(percentage, 0)}%` }}
        />
      </div>

      {status === "empty" ? (
        <p className="text-camp-earth/60 text-sm">{emptyMessage}</p>
      ) : (
        <p className="text-camp-earth text-sm">
          {detail ?? `${percentage}% complete`}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors block"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      {content}
    </div>
  );
}
