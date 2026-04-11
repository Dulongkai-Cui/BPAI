import { AiDormSkills } from "@/components/ai-dorm/ai-dorm-skills";
import { getAiDormSkillRepositoryData } from "@/lib/ai-dorm/server";

type AiDormSkillsPageProps = {
  searchParams?: Promise<{
    skill?: string | string[];
  }>;
};

export default async function AiDormSkillsPage({
  searchParams,
}: AiDormSkillsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedSkillId = Array.isArray(resolvedSearchParams?.skill)
    ? resolvedSearchParams.skill[0]
    : resolvedSearchParams?.skill;
  const repository = await getAiDormSkillRepositoryData(selectedSkillId);

  return <AiDormSkills repository={repository} />;
}
