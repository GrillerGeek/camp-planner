"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { TripJournalEntry } from "@/lib/types/reservations";
import {
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  uploadJournalPhoto,
} from "@/lib/queries/journal";

interface JournalClientProps {
  tripId: string;
  isPlanner: boolean;
  initialEntries: TripJournalEntry[];
}

export function JournalClient({
  tripId,
  isPlanner,
  initialEntries,
}: JournalClientProps) {
  const [entries, setEntries] = useState<TripJournalEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [editPhotoUrls, setEditPhotoUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  const handleFiles = useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) =>
      ["image/jpeg", "image/png", "image/webp", "image/heic"].includes(f.type)
    );
    setSelectedFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeEditPhoto = (index: number) => {
    setEditPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError("Journal entry content is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Upload new photos
      const newPhotoUrls: string[] = [];
      for (const file of selectedFiles) {
        const url = await uploadJournalPhoto(supabase, tripId, file);
        newPhotoUrls.push(url);
      }

      if (editingId) {
        const allPhotos = [...editPhotoUrls, ...newPhotoUrls];
        const updated = await updateJournalEntry(supabase, editingId, {
          content: content.trim(),
          photo_urls: allPhotos,
        });
        setEntries((prev) =>
          prev.map((entry) => (entry.id === editingId ? updated : entry))
        );
        setEditingId(null);
      } else {
        const created = await addJournalEntry(
          supabase,
          tripId,
          content.trim(),
          newPhotoUrls
        );
        setEntries((prev) => [...prev, created]);
      }

      setContent("");
      setSelectedFiles([]);
      setEditPhotoUrls([]);
      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save journal entry."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry: TripJournalEntry) => {
    setEditingId(entry.id);
    setContent(entry.content);
    setEditPhotoUrls(entry.photo_urls ?? []);
    setSelectedFiles([]);
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteJournalEntry(supabase, id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete journal entry."
      );
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setContent("");
    setSelectedFiles([]);
    setEditPhotoUrls([]);
    setError(null);
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !showForm && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📔</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            No journal entries yet
          </h2>
          <p className="text-camp-earth text-sm mb-6">
            Capture your trip memories, highlights, and photos here.
          </p>
          {isPlanner && (
            <button
              onClick={() => {
                setShowForm(true);
                setEditingId(null);
                setContent("");
                setSelectedFiles([]);
              }}
              className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
            >
              Add Journal Entry
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      {entries.length > 0 && (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-white/10" />

          <div className="space-y-6">
            {entries.map((entry) => (
              <div key={entry.id} className="relative pl-10">
                {/* Timeline dot */}
                <div className="absolute left-[11px] top-5 w-3 h-3 rounded-full bg-camp-forest border-2 border-camp-night" />

                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-camp-earth/60 text-xs">
                      {formatDateTime(entry.created_at)}
                    </span>
                    {isPlanner && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(entry)}
                          className="text-camp-earth hover:text-white text-xs py-1 px-2 rounded hover:bg-white/10 transition-colors"
                        >
                          Edit
                        </button>
                        {deleteConfirmId === entry.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="text-red-400 hover:text-red-300 text-xs py-1 px-2 rounded hover:bg-red-500/10 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-camp-earth hover:text-white text-xs py-1 px-2 rounded hover:bg-white/10 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(entry.id)}
                            className="text-red-400/60 hover:text-red-400 text-xs py-1 px-2 rounded hover:bg-red-500/10 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-white text-sm whitespace-pre-wrap">
                    {entry.content}
                  </p>

                  {/* Photo gallery */}
                  {entry.photo_urls && entry.photo_urls.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {entry.photo_urls.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setLightboxUrl(url)}
                          className="aspect-square rounded-lg overflow-hidden bg-white/5 hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={url}
                            alt={`Photo ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add button */}
      {isPlanner && !showForm && entries.length > 0 && (
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setContent("");
            setSelectedFiles([]);
          }}
          className="mt-6 bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2"
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
          Add Journal Entry
        </button>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-xl p-5 mt-6"
        >
          <h3 className="text-white font-semibold mb-4">
            {editingId ? "Edit Journal Entry" : "New Journal Entry"}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-camp-earth text-sm mb-1">
                What happened? <span className="text-red-400">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest resize-none"
                placeholder="Write about your experience, favorite moments, things to remember..."
              />
            </div>

            {/* Existing photos when editing */}
            {editingId && editPhotoUrls.length > 0 && (
              <div>
                <label className="block text-camp-earth text-sm mb-2">
                  Current Photos
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {editPhotoUrls.map((url, i) => (
                    <div key={i} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-white/5">
                        <img
                          src={url}
                          alt={`Photo ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEditPhoto(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photo upload */}
            <div>
              <label className="block text-camp-earth text-sm mb-2">
                Photos
              </label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging
                    ? "border-camp-forest bg-camp-forest/10"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-camp-earth text-sm mb-2">
                  Drag and drop photos here, or
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-camp-sky hover:text-camp-sky/80 text-sm font-medium"
                >
                  browse files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  onChange={(e) =>
                    e.target.files && handleFiles(e.target.files)
                  }
                  className="hidden"
                />
                <div className="text-camp-earth/40 text-xs mt-2">
                  JPEG, PNG, WebP, HEIC
                </div>
              </div>

              {/* Selected files preview */}
              {selectedFiles.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-white/5">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                : "Add Entry"}
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

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl"
          >
            x
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
