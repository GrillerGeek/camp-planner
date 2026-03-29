import { SupabaseClient } from "@supabase/supabase-js";
import {
  TaskTemplate,
  TaskTemplateWithItems,
  TaskTemplateItem,
  TripTask,
} from "@/lib/types/tasks";

// ============================================================
// TRIP TASKS
// ============================================================

export async function getTripTasks(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripTask[]> {
  const { data, error } = await supabase
    .from("trip_tasks")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTask(
  supabase: SupabaseClient,
  task: {
    trip_id: string;
    title: string;
    description?: string;
    assigned_to?: string | null;
    due_date?: string | null;
    priority?: "low" | "medium" | "high";
    sort_order?: number;
  }
): Promise<TripTask> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("trip_tasks")
    .insert({
      trip_id: task.trip_id,
      title: task.title.trim(),
      description: task.description?.trim() || null,
      assigned_to: task.assigned_to || null,
      due_date: task.due_date || null,
      priority: task.priority ?? "medium",
      sort_order: task.sort_order ?? 0,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTask(
  supabase: SupabaseClient,
  taskId: string,
  updates: Partial<{
    title: string;
    description: string | null;
    assigned_to: string | null;
    due_date: string | null;
    priority: "low" | "medium" | "high";
    is_completed: boolean;
    completed_at: string | null;
    completed_by: string | null;
    sort_order: number;
  }>
): Promise<TripTask> {
  const { data, error } = await supabase
    .from("trip_tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_tasks")
    .delete()
    .eq("id", taskId);
  if (error) throw error;
}

export async function toggleTaskComplete(
  supabase: SupabaseClient,
  taskId: string,
  isCompleted: boolean
): Promise<TripTask> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const updates: Record<string, unknown> = {
    is_completed: isCompleted,
    completed_at: isCompleted ? new Date().toISOString() : null,
    completed_by: isCompleted ? user?.id ?? null : null,
  };

  const { data, error } = await supabase
    .from("trip_tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// TASK TEMPLATES
// ============================================================

export async function getTaskTemplates(
  supabase: SupabaseClient
): Promise<(TaskTemplate & { item_count: number })[]> {
  const { data, error } = await supabase
    .from("task_templates")
    .select("*, task_template_items(count)")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(
    (t: TaskTemplate & { task_template_items: { count: number }[] }) => ({
      ...t,
      item_count: t.task_template_items?.[0]?.count ?? 0,
    })
  );
}

export async function getTaskTemplateById(
  supabase: SupabaseClient,
  templateId: string
): Promise<TaskTemplateWithItems | null> {
  const { data, error } = await supabase
    .from("task_templates")
    .select("*, task_template_items(*)")
    .eq("id", templateId)
    .order("sort_order", {
      referencedTable: "task_template_items",
      ascending: true,
    })
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

export async function createTaskTemplate(
  supabase: SupabaseClient,
  template: {
    name: string;
    description?: string;
  }
): Promise<TaskTemplate> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("task_templates")
    .insert({
      name: template.name.trim(),
      description: template.description?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTaskTemplate(
  supabase: SupabaseClient,
  templateId: string,
  template: {
    name?: string;
    description?: string;
  }
): Promise<TaskTemplate> {
  const updateData: Record<string, unknown> = {};
  if (template.name !== undefined) updateData.name = template.name.trim();
  if (template.description !== undefined)
    updateData.description = template.description.trim() || null;

  const { data, error } = await supabase
    .from("task_templates")
    .update(updateData)
    .eq("id", templateId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTaskTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .from("task_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw error;
}

// ============================================================
// TASK TEMPLATE ITEMS
// ============================================================

export async function addTaskTemplateItem(
  supabase: SupabaseClient,
  item: {
    template_id: string;
    title: string;
    description?: string;
    sort_order?: number;
  }
): Promise<TaskTemplateItem> {
  const { data, error } = await supabase
    .from("task_template_items")
    .insert({
      template_id: item.template_id,
      title: item.title.trim(),
      description: item.description?.trim() || null,
      sort_order: item.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTaskTemplateItem(
  supabase: SupabaseClient,
  itemId: string,
  updates: Partial<{
    title: string;
    description: string;
    sort_order: number;
  }>
): Promise<TaskTemplateItem> {
  const { data, error } = await supabase
    .from("task_template_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTaskTemplateItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("task_template_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

// ============================================================
// APPLY TEMPLATE TO TRIP
// ============================================================

export async function applyTaskTemplate(
  supabase: SupabaseClient,
  tripId: string,
  templateId: string,
  existingTaskCount: number
): Promise<TripTask[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const template = await getTaskTemplateById(supabase, templateId);
  if (!template) throw new Error("Template not found");

  const items = template.task_template_items ?? [];
  if (items.length === 0) return [];

  const tasksToInsert = items.map((item, index) => ({
    trip_id: tripId,
    title: item.title,
    description: item.description,
    priority: "medium" as const,
    sort_order: existingTaskCount + index,
    created_by: user.id,
  }));

  const { data, error } = await supabase
    .from("trip_tasks")
    .insert(tasksToInsert)
    .select();

  if (error) throw error;
  return data ?? [];
}

// ============================================================
// TASK PROGRESS
// ============================================================

export async function getTaskProgress(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ completed: number; total: number } | null> {
  const { data, error } = await supabase
    .from("trip_tasks")
    .select("id, is_completed")
    .eq("trip_id", tripId);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  return {
    completed: data.filter((t: { is_completed: boolean }) => t.is_completed)
      .length,
    total: data.length,
  };
}
