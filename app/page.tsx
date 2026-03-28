import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-camp-night flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="text-6xl mb-6">🏕️</div>
        <h1 className="text-4xl font-bold text-white mb-3">Camp Planner</h1>
        <p className="text-camp-earth text-lg mb-8">
          Plan trips, pack smart, eat well. All in one place.
        </p>
        <Link
          href="/login"
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-3 px-8 rounded-lg transition-colors text-lg"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}
