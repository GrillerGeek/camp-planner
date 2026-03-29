import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTaskTemplates } from "@/lib/queries/tasks";
import { DeleteTaskTemplateButton } from "./components/DeleteTaskTemplateButton";

export default async function TaskTemplatesPage() {
  const supabase = await createClient();

  let templates: Awaited<ReturnType<typeof getTaskTemplates>> = [];
  try {
    templates = await getTaskTemplates(supabase);
  } catch {
    templates = [];
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Task Templates
          </h1>
          <p className="text-camp-earth">
            Create reusable task checklists for trip preparation.
          </p>
        </div>
        <Link
          href="/dashboard/task-templates/new"
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
          New Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            No task templates yet
          </h2>
          <p className="text-camp-earth mb-6 max-w-sm mx-auto">
            Create your first task template to quickly populate trips with
            common preparation checklists.
          </p>
          <Link
            href="/dashboard/task-templates/new"
            className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-white font-medium text-lg">
                  {template.name}
                </h3>
                <DeleteTaskTemplateButton templateId={template.id} />
              </div>

              {template.description && (
                <p className="text-camp-earth text-sm mb-3 line-clamp-2">
                  {template.description}
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-camp-earth text-sm">
                  {template.item_count} task
                  {template.item_count !== 1 ? "s" : ""}
                </span>
                <Link
                  href={`/dashboard/task-templates/${template.id}/edit`}
                  className="text-camp-sky hover:text-camp-sky/80 text-sm font-medium transition-colors"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
