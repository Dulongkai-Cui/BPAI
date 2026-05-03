import { AiDormSkills } from "@/components/ai-dorm/ai-dorm-skills";
import { getAiDormSkillRepositoryData } from "@/lib/ai-dorm/server";

type AiDormSkillsPageProps = {
  searchParams?: Promise<{
    panel?: string | string[];
    skill?: string | string[];
  }>;
};

const VALID_PANELS = ["api", "skill", "blueprints", "rag", "memory"] as const;

export default async function AiDormSkillsPage({
  searchParams,
}: AiDormSkillsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const panelParam = Array.isArray(resolvedSearchParams?.panel)
    ? resolvedSearchParams.panel[0]
    : resolvedSearchParams?.panel;
  const selectedSkillId = Array.isArray(resolvedSearchParams?.skill)
    ? resolvedSearchParams.skill[0]
    : resolvedSearchParams?.skill;
  const initialPanel = VALID_PANELS.find((panel) => panel === panelParam);
  const repository = await getAiDormSkillRepositoryData(selectedSkillId);

  return <AiDormSkills repository={repository} initialPanel={initialPanel} />;
}
