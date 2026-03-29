import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTaskTemplateById } from "@/lib/queries/tasks";
import { TaskTemplateForm } from "../../components/TaskTemplateForm";
import { TaskTemplateItemsEditor } from "../../components/TaskTemplateItemsEditor";

export default async function EditTaskTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createClient();
  const template = await getTaskTemplateById(supabase, templateId);

  if (!template) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Template not found
        </h2>
        <p className="text-camp-earth mb-6">
          This template doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link
          href="/dashboard/task-templates"
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
        >
          Back to task templates
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/task-templates"
          className="text-camp-earth hover:text-white text-sm transition-colors flex items-center gap-1"
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
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Back to task templates
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">
        Edit Template: {template.name}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Template Details
          </h2>
          <TaskTemplateForm mode="edit" initialData={template} />
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Template Tasks
          </h2>
          <TaskTemplateItemsEditor
            templateId={template.id}
            initialItems={template.task_template_items ?? []}
          />
        </div>
      </div>
    </div>
  );
}
