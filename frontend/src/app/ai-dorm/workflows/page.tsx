import { AiDormWorkflows } from "@/components/ai-dorm/ai-dorm-workflows";
import { requireCurrentUser } from "@/lib/auth/server";
import { getAiDormWorkflowStudioData } from "@/lib/ai-dorm/server";

type AiDormWorkflowsPageProps = {
  searchParams?: Promise<{
    workflow?: string | string[];
  }>;
};

export default async function AiDormWorkflowsPage({
  searchParams,
}: AiDormWorkflowsPageProps) {
  const user = await requireCurrentUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedWorkflowId = Array.isArray(resolvedSearchParams?.workflow)
    ? resolvedSearchParams.workflow[0]
    : resolvedSearchParams?.workflow;
  const studio = await getAiDormWorkflowStudioData(user, selectedWorkflowId);

  return <AiDormWorkflows studio={studio} />;
}
