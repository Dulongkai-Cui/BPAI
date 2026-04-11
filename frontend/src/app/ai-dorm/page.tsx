import { AiDormOverviewPanel } from "@/components/ai-dorm/ai-dorm-overview";
import { requireCurrentUser } from "@/lib/auth/server";
import { getAiDormLandingData } from "@/lib/ai-dorm/server";

export default async function AiDormPage() {
  const user = await requireCurrentUser();
  const overview = await getAiDormLandingData(user.id);

  return <AiDormOverviewPanel overview={overview} />;
}
