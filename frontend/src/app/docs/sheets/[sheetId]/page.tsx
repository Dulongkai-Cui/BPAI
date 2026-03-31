import { redirect } from "next/navigation";

type SheetWorkspacePageProps = {
  params: Promise<{ sheetId: string }>;
};

export default async function SheetWorkspacePage({
  params,
}: SheetWorkspacePageProps) {
  const { sheetId } = await params;

  redirect(`/docs/documents/${sheetId}`);
}
