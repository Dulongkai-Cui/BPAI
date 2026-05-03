import { AiDormSkillPackages } from "@/components/ai-dorm/ai-dorm-skill-packages";
import {
  getAiProductionSkillFolders,
  getAiProductionSkillPackages,
} from "@/lib/ai-dorm/production-assets";

export default async function AiDormSkillPackagesPage() {
  const [packages, folders] = await Promise.all([
    getAiProductionSkillPackages(),
    getAiProductionSkillFolders(),
  ]);

  return <AiDormSkillPackages packages={packages} folders={folders} />;
}
