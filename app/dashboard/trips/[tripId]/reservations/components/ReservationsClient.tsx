"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TripReservation,
  ReservationFormData,
} from "@/lib/types/reservations";
import {
  addReservation,
  updateReservation,
  deleteReservation,
} from "@/lib/queries/reservations";

const emptyForm: ReservationFormData = {
  campground_name: "",
  site_number: "",
  confirmation_number: "",
  check_in_date: "",
  check_out_date: "",
  check_in_time: "",
  check_out_time: "",
  cost: "",
  contact_info: "",
  notes: "",
};

function reservationToForm(r: TripReservation): ReservationFormData {
  return {
    campground_name: r.campground_name,
    site_number: r.site_number ?? "",
    confirmation_number: r.confirmation_number ?? "",
    check_in_date: r.check_in_date ?? "",
    check_out_date: r.check_out_date ?? "",
    check_in_time: r.check_in_time ?? "",
    check_out_time: r.check_out_time ?? "",
    cost: r.cost != null ? String(r.cost) : "",
    contact_info: r.contact_info ?? "",
    notes: r.notes ?? "",
  };
}

interface ReservationsClientProps {
  tripId: string;
  isPlanner: boolean;
  initialReservations: TripReservation[];
}

export function ReservationsClient({
  tripId,
  isPlanner,
  initialReservations,
}: ReservationsClientProps) {
  const [reservations, setReservations] =
    useState<TripReservation[]>(initialReservations);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReservationFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const supabase = createClient();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campground_name.trim()) {
      setError("Campground name is required.");
      return;
    }
    if (form.cost && (isNaN(parseFloat(form.cost)) || parseFloat(form.cost) < 0)) {
      setError("Cost must be a valid non-negative number.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const updated = await updateReservation(supabase, editingId, form);
        setReservations((prev) =>
          prev.map((r) => (r.id === editingId ? updated : r))
        );
        setEditingId(null);
      } else {
        const created = await addReservation(supabase, tripId, form);
        setReservations((prev) =>
          [...prev, created].sort((a, b) => {
            if (!a.check_in_date && !b.check_in_date) return 0;
            if (!a.check_in_date) return 1;
            if (!b.check_in_date) return -1;
            return a.check_in_date.localeCompare(b.check_in_date);
          })
        );
      }
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reservation.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (reservation: TripReservation) => {
    setEditingId(reservation.id);
    setForm(reservationToForm(reservation));
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReservation(supabase, id);
      setReservations((prev) => prev.filter((r) => r.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete reservation.");
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCost = (cost: number | null) => {
    if (cost == null) return null;
    return `$${cost.toFixed(2)}`;
  };

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Reservation cards */}
      {reservations.length === 0 && !showForm && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            No reservations yet
          </h2>
          <p className="text-camp-earth text-sm mb-6">
            Add your campsite reservation details to keep everything in one
            place.
          </p>
          {isPlanner && (
            <button
              onClick={() => {
                setShowForm(true);
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
            >
              Add Reservation
            </button>
          )}
        </div>
      )}

      {reservations.length > 0 && (
        <div className="space-y-4 mb-6">
          {reservations.map((reservation) => (
            <div
              key={reservation.id}
              className="bg-white/5 border border-white/10 rounded-xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-lg truncate">
                    {reservation.campground_name}
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {reservation.confirmation_number && (
                      <span className="text-camp-sky text-sm font-mono">
                        #{reservation.confirmation_number}
                      </span>
                    )}
                    {reservation.site_number && (
                      <span className="text-camp-earth text-sm">
                        Site {reservation.site_number}
                      </span>
                    )}
                    {reservation.cost != null && (
                      <span className="text-camp-forest text-sm font-medium">
                        {formatCost(reservation.cost)}
                      </span>
                    )}
                  </div>
                </div>
                {isPlanner && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEdit(reservation)}
                      className="text-camp-earth hover:text-white text-sm py-1 px-2 rounded hover:bg-white/10 transition-colors"
                    >
                      Edit
                    </button>
                    {deleteConfirmId === reservation.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(reservation.id)}
                          className="text-red-400 hover:text-red-300 text-sm py-1 px-2 rounded hover:bg-red-500/10 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-camp-earth hover:text-white text-sm py-1 px-2 rounded hover:bg-white/10 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(reservation.id)}
                        className="text-red-400/60 hover:text-red-400 text-sm py-1 px-2 rounded hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Dates and times */}
              {(reservation.check_in_date || reservation.check_out_date) && (
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                  {reservation.check_in_date && (
                    <div className="text-sm">
                      <span className="text-camp-earth/60">Check-in: </span>
                      <span className="text-white">
                        {formatDate(reservation.check_in_date)}
                        {reservation.check_in_time &&
                          ` at ${reservation.check_in_time}`}
                      </span>
                    </div>
                  )}
                  {reservation.check_out_date && (
                    <div className="text-sm">
                      <span className="text-camp-earth/60">Check-out: </span>
                      <span className="text-white">
                        {formatDate(reservation.check_out_date)}
                        {reservation.check_out_time &&
                          ` at ${reservation.check_out_time}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Contact info */}
              {reservation.contact_info && (
                <div className="mt-2 text-sm">
                  <span className="text-camp-earth/60">Contact: </span>
                  <span className="text-camp-earth">
                    {reservation.contact_info}
                  </span>
                </div>
              )}

              {/* Notes */}
              {reservation.notes && (
                <div className="mt-2 text-sm text-camp-earth/80 bg-white/5 rounded-lg p-3">
                  {reservation.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add button (when not showing form and has reservations) */}
      {isPlanner && !showForm && reservations.length > 0 && (
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setForm(emptyForm);
          }}
          className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Add Reservation
        </button>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-xl p-5 mt-4"
        >
          <h3 className="text-white font-semibold mb-4">
            {editingId ? "Edit Reservation" : "New Reservation"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Campground Name - required */}
            <div className="sm:col-span-2">
              <label className="block text-camp-earth text-sm mb-1">
                Campground Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="campground_name"
                value={form.campground_name}
                onChange={handleChange}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
                placeholder="e.g., Yosemite Valley Campground"
              />
            </div>

            {/* Site Number */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Site Number
              </label>
              <input
                type="text"
                name="site_number"
                value={form.site_number}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
                placeholder="e.g., A-12"
              />
            </div>

            {/* Confirmation Number */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Confirmation Number
              </label>
              <input
                type="text"
                name="confirmation_number"
                value={form.confirmation_number}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
                placeholder="e.g., RES-2026/04#7734"
              />
            </div>

            {/* Check-in Date */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Check-in Date
              </label>
              <input
                type="date"
                name="check_in_date"
                value={form.check_in_date}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-camp-forest"
              />
            </div>

            {/* Check-out Date */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Check-out Date
              </label>
              <input
                type="date"
                name="check_out_date"
                value={form.check_out_date}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-camp-forest"
              />
            </div>

            {/* Check-in Time */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Check-in Time
              </label>
              <input
                type="text"
                name="check_in_time"
                value={form.check_in_time}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
                placeholder="e.g., 2:00 PM"
              />
            </div>

            {/* Check-out Time */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Check-out Time
              </label>
              <input
                type="text"
                name="check_out_time"
                value={form.check_out_time}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
                placeholder="e.g., 12:00 PM"
              />
            </div>

            {/* Cost */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Cost ($)
              </label>
              <input
                type="text"
                name="cost"
                value={form.cost}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
                placeholder="e.g., 35.00"
              />
            </div>

            {/* Contact Info */}
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                Contact Info
              </label>
              <input
                type="text"
                name="contact_info"
                value={form.contact_info}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
                placeholder="Phone or email"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-camp-earth text-sm mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest resize-none"
                placeholder="Additional notes about this reservation..."
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : editingId
                ? "Save Changes"
                : "Add Reservation"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-camp-earth hover:text-white text-sm py-2 px-4 rounded-lg hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
