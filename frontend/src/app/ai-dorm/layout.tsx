import type { ReactNode } from "react";

import { BpAskTopbar } from "@/components/bp-ask/bp-ask-topbar";
import { AiDormSidebar } from "@/components/ai-dorm/ai-dorm-sidebar";
import { requireCurrentUser } from "@/lib/auth/server";
import { getAiDormNavSummary } from "@/lib/ai-dorm/server";

export default async function AiDormLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();
  const counts = await getAiDormNavSummary(user.id);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <BpAskTopbar user={user} />
      <div className="mt-16 min-h-[calc(100vh-4rem)]">
        <AiDormSidebar user={user} counts={counts} />
        <main className="min-h-[calc(100vh-4rem)] overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.18),transparent_26%),linear-gradient(180deg,#f4f8ff_0%,#f8fbff_42%,#edf2f9_100%)] px-2 py-4 sm:px-4 md:ml-72">
          <div className="mx-auto max-w-none">{children}</div>
        </main>
      </div>
    </div>
  );
}
