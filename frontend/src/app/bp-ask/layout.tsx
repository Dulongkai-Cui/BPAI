import type { ReactNode } from "react";

import { requireCurrentUser } from "@/lib/auth/server";
import { BpAskTopbar } from "@/components/bp-ask/bp-ask-topbar";

export default async function BpAskLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <BpAskTopbar user={user} />
      <main className="mt-16 h-[calc(100vh-4rem)] overflow-hidden">
        {children}
      </main>
    </div>
  );
}
