import Link from "next/link";
import { TaskTemplateForm } from "../components/TaskTemplateForm";

export default function NewTaskTemplatePage() {
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
        Create Task Template
      </h1>

      <TaskTemplateForm mode="create" />
    </div>
  );
}
