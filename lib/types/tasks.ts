export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplateItem {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface TaskTemplateWithItems extends TaskTemplate {
  task_template_items: TaskTemplateItem[];
}

export interface TripTask {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskFormData {
  title: string;
  description: string;
  assigned_to: string | null;
  due_date: string;
  priority: "low" | "medium" | "high";
}

export const PRIORITIES = ["low", "medium", "high"] as const;
