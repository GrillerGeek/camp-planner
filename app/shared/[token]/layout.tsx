export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-camp-night">
      <header className="border-b border-white/10 bg-camp-night/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label="tent">
            &#9978;
          </span>
          <span className="text-white font-semibold text-lg">Camp Planner</span>
          <span className="text-camp-earth/50 text-sm ml-2">Shared View</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
