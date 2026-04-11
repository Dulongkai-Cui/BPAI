import { AiDormTaskList } from "@/components/ai-dorm/ai-dorm-task-list";
import { requireCurrentUser } from "@/lib/auth/server";
import { listAiDormTasksForUser } from "@/lib/ai-dorm/server";

export default async function AiDormTasksPage() {
  const user = await requireCurrentUser();
  const tasks = await listAiDormTasksForUser(user.id, 80);

  return (
    <AiDormTaskList
      title="任务收件箱"
      description="execution_tasks / execution_results"
      tasks={tasks}
    />
  );
}
