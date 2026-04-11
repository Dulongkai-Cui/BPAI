import { AiDormAgents } from "@/components/ai-dorm/ai-dorm-agents";
import { requireCurrentUser } from "@/lib/auth/server";
import { getAiDormAccessProfile, getAiDormAgents } from "@/lib/ai-dorm/server";

export default async function AiDormAgentsPage() {
  const user = await requireCurrentUser();
  const [agents, access] = await Promise.all([
    getAiDormAgents(user.id),
    Promise.resolve(getAiDormAccessProfile(user)),
  ]);

  return (
    <AiDormAgents
      agents={agents}
      canManage={access.canManageAgents}
      scopeLabel={access.scopeLabel}
    />
  );
}
