import type { ReactNode } from "react";

import { EngineeringTopbar } from "@/components/engineering/engineering-topbar";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function EngineeringLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <EngineeringTopbar user={user} />
      <main className="mt-16 h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
