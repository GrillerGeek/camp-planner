"use client";

interface ReadinessCardProps {
  title: string;
  icon: string;
  status: "empty" | "in_progress" | "complete";
  percentage: number;
  emptyMessage: string;
}

export function ReadinessCard({
  title,
  icon,
  status,
  percentage,
  emptyMessage,
}: ReadinessCardProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xl">{icon}</span>
        <h3 className="text-white font-medium">{title}</h3>
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
        <p className="text-camp-earth text-sm">{percentage}% complete</p>
      )}
    </div>
  );
}
