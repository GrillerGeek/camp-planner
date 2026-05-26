"use client";

interface OfflineEmptyStateProps {
  pageName: "trip" | "reservations" | "packing" | "meals";
  onRetry?: () => void;
}

const COPY: Record<OfflineEmptyStateProps["pageName"], string> = {
  trip: "This trip isn't available offline. Connect to the internet to load it.",
  reservations:
    "This trip's reservations aren't available offline. Connect to the internet to load them.",
  packing:
    "This trip's packing list isn't available offline. Connect to the internet to load it.",
  meals:
    "This trip's meal plan isn't available offline. Connect to the internet to load it.",
};

export function OfflineEmptyState({ pageName, onRetry }: OfflineEmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">📡</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Not available offline
      </h2>
      <p className="text-camp-earth mb-6 max-w-md mx-auto">{COPY[pageName]}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
