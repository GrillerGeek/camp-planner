"use client";

import Link from "next/link";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/dashboard", label: "Trips" },
  { href: "/dashboard/templates", label: "Packing Templates" },
  { href: "/dashboard/task-templates", label: "Task Templates" },
  { href: "/dashboard/recipes", label: "Recipes" },
  { href: "/dashboard/inventory", label: "Inventory" },
  { href: "/dashboard/history", label: "History" },
];

export function DashboardNav() {
  const [open, setOpen] = useState(false);
  // Close the drawer whenever the user picks a link. We attach this directly
  // to each link rather than reacting to pathname changes from an effect
  // (which would trip React 19's set-state-in-effect rule).
  const closeDrawer = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="sm:hidden text-camp-earth hover:text-white p-2 -ml-2"
      >
        {open ? (
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 6l12 12M6 18L18 6"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      <nav className="hidden sm:flex items-center gap-4">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-camp-earth hover:text-white text-sm transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {open && (
        <div
          className="sm:hidden fixed top-14 left-0 right-0 bg-camp-night/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex flex-col gap-1 z-40 shadow-lg"
          role="navigation"
          aria-label="Main"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeDrawer}
              className="text-camp-earth hover:text-white hover:bg-white/5 text-base py-3 px-2 rounded transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
