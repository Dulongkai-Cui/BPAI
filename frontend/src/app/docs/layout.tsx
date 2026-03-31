import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsTopbar } from "@/components/docs/docs-topbar";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function DocsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <DocsTopbar user={user} />
      <DocsSidebar user={user} />
      <main className="ml-64 mt-16 h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
