"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createTask,
  updateTask,
  deleteTask,
  toggleTaskComplete,
  getTaskTemplates,
  applyTaskTemplate,
} from "@/lib/queries/tasks";
import { TripTask, TaskTemplate } from "@/lib/types/tasks";

interface TaskListClientProps {
  tripId: string;
  isPlanner: boolean;
  currentUserId: string | null;
  initialTasks: TripTask[];
  members: { user_id: string; display_name: string; role: string }[];
}

type StatusFilter = "all" | "pending" | "completed";
type SortMode = "sort_order" | "due_date" | "priority";

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function TaskListClient({
  tripId,
  isPlanner,
  currentUserId,
  initialTasks,
  members,
}: TaskListClientProps) {
  const [tasks, setTasks] = useState<TripTask[]>(initialTasks);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMember, setFilterMember] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("sort_order");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<
    (TaskTemplate & { item_count: number })[]
  >([]);
  const [templateLoading, setTemplateLoading] = useState(false);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    assigned_to: "" as string,
    due_date: "",
    priority: "medium" as "low" | "medium" | "high",
  });

  const [editTask, setEditTask] = useState({
    title: "",
    description: "",
    assigned_to: "" as string,
    due_date: "",
    priority: "medium" as "low" | "medium" | "high",
  });

  const supabase = createClient();

  // Realtime subscription for trip_tasks
  useEffect(() => {
    const channel = supabase
      .channel(`tasks-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_tasks",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setTasks((prev) => {
              if (prev.some((t) => t.id === (payload.new as TripTask).id))
                return prev;
              return [...prev, payload.new as TripTask];
            });
          } else if (payload.eventType === "UPDATE") {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === (payload.new as TripTask).id
                  ? (payload.new as TripTask)
                  : t
              )
            );
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) =>
              prev.filter((t) => t.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  // Add new task
  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    if (newTask.title.length > 300) {
      setError("Task title must be 300 characters or less");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const task = await createTask(supabase, {
        trip_id: tripId,
        title: newTask.title,
        description: newTask.description || undefined,
        assigned_to: newTask.assigned_to || null,
        due_date: newTask.due_date || null,
        priority: newTask.priority,
        sort_order: tasks.length,
      });

      setTasks((prev) => [...prev, task]);
      setNewTask({
        title: "",
        description: "",
        assigned_to: "",
        due_date: "",
        priority: "medium",
      });
      setShowAddForm(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't add the task. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // Toggle completion
  async function handleToggleComplete(taskId: string, currentCompleted: boolean) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              is_completed: !currentCompleted,
              completed_at: !currentCompleted ? new Date().toISOString() : null,
            }
          : t
      )
    );

    try {
      await toggleTaskComplete(supabase, taskId, !currentCompleted);
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, is_completed: currentCompleted, completed_at: currentCompleted ? t.completed_at : null }
            : t
        )
      );
    }
  }

  // Start editing
  function startEditing(task: TripTask) {
    setEditingTaskId(task.id);
    setEditTask({
      title: task.title,
      description: task.description ?? "",
      assigned_to: task.assigned_to ?? "",
      due_date: task.due_date ?? "",
      priority: task.priority,
    });
  }

  // Save edit
  async function handleSaveEdit(taskId: string) {
    if (!editTask.title.trim()) return;

    try {
      const updated = await updateTask(supabase, taskId, {
        title: editTask.title.trim(),
        description: editTask.description.trim() || null,
        assigned_to: editTask.assigned_to || null,
        due_date: editTask.due_date || null,
        priority: editTask.priority,
      });

      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      setEditingTaskId(null);
    } catch {
      // ignore
    }
  }

  // Delete task
  async function handleDeleteTask(taskId: string) {
    const prev = tasks;
    setTasks((tasks) => tasks.filter((t) => t.id !== taskId));
    try {
      await deleteTask(supabase, taskId);
    } catch {
      setTasks(prev);
    }
  }

  // Load and show templates
  async function handleShowTemplates() {
    setShowTemplateModal(true);
    setTemplateLoading(true);
    try {
      const tmpl = await getTaskTemplates(supabase);
      setTemplates(tmpl);
    } catch {
      setTemplates([]);
    } finally {
      setTemplateLoading(false);
    }
  }

  // Apply template
  async function handleApplyTemplate(templateId: string) {
    setTemplateLoading(true);
    try {
      const newTasks = await applyTaskTemplate(
        supabase,
        tripId,
        templateId,
        tasks.length
      );
      setTasks((prev) => [...prev, ...newTasks]);
      setShowTemplateModal(false);
    } catch {
      // ignore
    } finally {
      setTemplateLoading(false);
    }
  }

  // Filter tasks
  let filteredTasks = tasks;
  if (filterMember !== "all") {
    filteredTasks =
      filterMember === "unassigned"
        ? filteredTasks.filter((t) => !t.assigned_to)
        : filteredTasks.filter((t) => t.assigned_to === filterMember);
  }
  if (statusFilter === "pending") {
    filteredTasks = filteredTasks.filter((t) => !t.is_completed);
  } else if (statusFilter === "completed") {
    filteredTasks = filteredTasks.filter((t) => t.is_completed);
  }

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortMode === "due_date") {
      if (!a.due_date && !b.due_date) return a.sort_order - b.sort_order;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    if (sortMode === "priority") {
      const diff =
        (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      if (diff !== 0) return diff;
      return a.sort_order - b.sort_order;
    }
    return a.sort_order - b.sort_order;
  });

  // Progress
  const completed = tasks.filter((t) => t.is_completed).length;
  const total = tasks.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  function priorityColor(priority: string) {
    switch (priority) {
      case "high":
        return "bg-camp-fire/20 text-camp-fire";
      case "medium":
        return "bg-camp-sky/20 text-camp-sky";
      case "low":
        return "bg-camp-earth/20 text-camp-earth";
      default:
        return "bg-white/10 text-white";
    }
  }

  function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toISOString().split("T")[0]);
  }

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Progress Bar */}
      {total > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-medium">Task Progress</span>
            <span className="text-camp-earth text-sm">
              {completed}/{total} tasks completed ({percentage}%)
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                percentage === 100 ? "bg-camp-forest" : "bg-camp-sky"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {isPlanner && (
          <>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
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
              Add Task
            </button>

            <button
              onClick={handleShowTemplates}
              className="bg-camp-sky hover:bg-camp-sky/80 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
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
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
                />
              </svg>
              Apply Template
            </button>
          </>
        )}

        {/* Filters */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
        >
          <option value="all" className="bg-camp-night">
            All tasks
          </option>
          <option value="pending" className="bg-camp-night">
            Pending
          </option>
          <option value="completed" className="bg-camp-night">
            Completed
          </option>
        </select>

        {members.length > 1 && (
          <select
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          >
            <option value="all" className="bg-camp-night">
              All members
            </option>
            <option value="unassigned" className="bg-camp-night">
              Unassigned
            </option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id} className="bg-camp-night">
                {m.display_name}
              </option>
            ))}
          </select>
        )}

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
        >
          <option value="sort_order" className="bg-camp-night">
            Default order
          </option>
          <option value="due_date" className="bg-camp-night">
            Due date
          </option>
          <option value="priority" className="bg-camp-night">
            Priority
          </option>
        </select>
      </div>

      {/* Add Task Form */}
      {showAddForm && isPlanner && (
        <form
          onSubmit={handleAddTask}
          className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6"
        >
          <div className="space-y-3">
            <div>
              <input
                type="text"
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Task title..."
                maxLength={300}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
              />
            </div>
            <div>
              <textarea
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Description (optional)"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent resize-none"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={newTask.assigned_to}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    assigned_to: e.target.value,
                  }))
                }
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
              >
                <option value="" className="bg-camp-night">
                  Unassigned
                </option>
                {members.map((m) => (
                  <option
                    key={m.user_id}
                    value={m.user_id}
                    className="bg-camp-night"
                  >
                    {m.display_name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newTask.due_date}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, due_date: e.target.value }))
                }
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
              />
              <select
                value={newTask.priority}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    priority: e.target.value as "low" | "medium" | "high",
                  }))
                }
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
              >
                <option value="low" className="bg-camp-night">
                  Low
                </option>
                <option value="medium" className="bg-camp-night">
                  Medium
                </option>
                <option value="high" className="bg-camp-night">
                  High
                </option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading || !newTask.title.trim()}
                className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading ? "Adding..." : "Add Task"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-camp-earth hover:text-white text-sm py-2 px-3 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-camp-night border border-white/10 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Apply Task Template
              </h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-camp-earth hover:text-white transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {templateLoading ? (
              <div className="text-center py-8">
                <svg
                  className="animate-spin w-6 h-6 text-camp-sky mx-auto"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <p className="text-camp-earth text-sm mt-2">
                  Loading templates...
                </p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-camp-earth text-sm">
                  No task templates yet. Create one from the Task Templates
                  page.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleApplyTemplate(template.id)}
                    disabled={templateLoading}
                    className="w-full text-left bg-white/5 border border-white/10 rounded-lg p-3 hover:border-white/20 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium text-sm">
                        {template.name}
                      </span>
                      <span className="text-camp-earth text-xs">
                        {template.item_count} task
                        {template.item_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {template.description && (
                      <p className="text-camp-earth/60 text-xs mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task List */}
      {total === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            No tasks yet
          </h2>
          <p className="text-camp-earth text-sm max-w-sm mx-auto">
            {isPlanner
              ? "Add tasks to track trip preparation, or apply a template to get started."
              : "The trip planner hasn't added any tasks yet."}
          </p>
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-camp-earth text-sm">
            No tasks match the current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sortedTasks.map((task) => (
            <div
              key={task.id}
              className={`bg-white/5 rounded-lg px-4 py-3 group transition-colors ${
                task.is_completed ? "opacity-60" : ""
              }`}
            >
              {editingTaskId === task.id ? (
                /* Inline Edit Form */
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editTask.title}
                    onChange={(e) =>
                      setEditTask((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    maxLength={300}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                  />
                  <textarea
                    value={editTask.description}
                    onChange={(e) =>
                      setEditTask((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="Description"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent resize-none"
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <select
                      value={editTask.assigned_to}
                      onChange={(e) =>
                        setEditTask((prev) => ({
                          ...prev,
                          assigned_to: e.target.value,
                        }))
                      }
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                    >
                      <option value="" className="bg-camp-night">
                        Unassigned
                      </option>
                      {members.map((m) => (
                        <option
                          key={m.user_id}
                          value={m.user_id}
                          className="bg-camp-night"
                        >
                          {m.display_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={editTask.due_date}
                      onChange={(e) =>
                        setEditTask((prev) => ({
                          ...prev,
                          due_date: e.target.value,
                        }))
                      }
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                    />
                    <select
                      value={editTask.priority}
                      onChange={(e) =>
                        setEditTask((prev) => ({
                          ...prev,
                          priority: e.target.value as
                            | "low"
                            | "medium"
                            | "high",
                        }))
                      }
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                    >
                      <option value="low" className="bg-camp-night">
                        Low
                      </option>
                      <option value="medium" className="bg-camp-night">
                        Medium
                      </option>
                      <option value="high" className="bg-camp-night">
                        High
                      </option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(task.id)}
                      className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-1.5 px-3 rounded-lg transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTaskId(null)}
                      className="text-camp-earth hover:text-white text-sm py-1.5 px-3 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Task Display */
                <div className="flex items-start gap-3">
                  {/* Checkbox — planners can toggle any task; viewers can
                     only toggle tasks assigned to themselves. Matches the
                     RLS + trip_tasks_enforce_viewer_scope trigger. */}
                  {(() => {
                    const canToggle =
                      isPlanner ||
                      (currentUserId !== null &&
                        task.assigned_to === currentUserId);
                    return (
                      <button
                        onClick={() =>
                          canToggle &&
                          handleToggleComplete(task.id, task.is_completed)
                        }
                        disabled={!canToggle}
                        title={
                          canToggle
                            ? undefined
                            : "Only the assignee or a planner can complete this task"
                        }
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors mt-0.5 ${
                          task.is_completed
                            ? "bg-camp-forest border-camp-forest"
                            : "border-white/30 hover:border-camp-forest"
                        } ${!canToggle ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {task.is_completed && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })()}

                  {/* Task Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium ${
                          task.is_completed
                            ? "text-camp-earth line-through"
                            : "text-white"
                        }`}
                      >
                        {task.title}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${priorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-camp-earth/60 text-xs mt-0.5 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {task.assigned_to && (
                        <span className="text-xs text-camp-earth">
                          {members.find((m) => m.user_id === task.assigned_to)
                            ?.display_name ?? "Assigned"}
                        </span>
                      )}
                      {task.due_date && (
                        <span
                          className={`text-xs ${
                            !task.is_completed && isOverdue(task.due_date)
                              ? "text-camp-fire"
                              : "text-camp-earth/60"
                          }`}
                        >
                          Due: {task.due_date}
                          {!task.is_completed && isOverdue(task.due_date) &&
                            " (overdue)"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Edit / Delete */}
                  {isPlanner && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => startEditing(task)}
                        className="text-camp-earth/40 hover:text-camp-sky transition-colors p-1"
                        title="Edit task"
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
                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-camp-earth/40 hover:text-red-400 transition-colors p-1"
                        title="Delete task"
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
                            d="M6 18 18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
