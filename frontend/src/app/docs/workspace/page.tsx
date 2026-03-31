import Link from "next/link";
import { CreateCollaborationSpaceButton } from "@/components/workspace/create-collaboration-space-button";
import { DissolveCollaborationSpaceButton } from "@/components/workspace/dissolve-collaboration-space-button";
import {
  getBootstrapAccountSummaries,
  requireCurrentUser,
} from "@/lib/auth/server";
import {
  normalizeWorkspaceEmail,
  type FormState,
  type SpaceTone,
} from "@/lib/workspace/mock-data";
import {
  getAssignedFormsForUser,
  getCollaborationSpaces,
  getWorkspaceCreationContactOptions,
  getSpacesForUser,
  getUpdatesForSpaceIds,
} from "@/lib/workspace/server";

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

function getWorkspaceHref(workspaceId: string) {
  return `/docs/workspace/${encodeURIComponent(workspaceId)}`;
}

function getToneClasses(tone: SpaceTone) {
  if (tone === "amber") {
    return {
      surface:
        "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.94))]",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (tone === "emerald") {
    return {
      surface:
        "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.94))]",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (tone === "violet") {
    return {
      surface:
        "border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.96),rgba(255,255,255,0.94))]",
      badge: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  return {
    surface:
      "border-blue-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.94))]",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
  };
}

function getFormStateClasses(state: FormState) {
  if (state === "待确认") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (state === "处理中") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (state === "本周重点") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default async function DocsWorkspacePage() {
  const currentUser = await requireCurrentUser();
  const accounts = getBootstrapAccountSummaries();
  const accountMap = new Map(
    accounts.map((account) => [normalizeWorkspaceEmail(account.email), account]),
  );
  const allSpaces = await getCollaborationSpaces();
  const { createdSpaces, joinedSpaces } = await getSpacesForUser(currentUser.email);
  const creationContactOptions = await getWorkspaceCreationContactOptions(currentUser.email);
  const myForms = getAssignedFormsForUser(currentUser.email);
  const myUpdates = getUpdatesForSpaceIds(
    [...createdSpaces, ...joinedSpaces].map((space) => space.id),
  );
  const spaceMap = new Map(allSpaces.map((space) => [space.id, space]));

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.30),transparent_30%),radial-gradient(circle_at_top_right,rgba(254,240,138,0.18),transparent_24%),linear-gradient(180deg,#eef4ff_0%,#f8faff_36%,#eef3fb_100%)]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <section className="overflow-hidden rounded-[40px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.82))] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                进入你创建和加入的空间
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <CreateCollaborationSpaceButton contactOptions={creationContactOptions} />
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                最近更新
              </div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                系统输出
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {myUpdates.map((item) => {
                const space = spaceMap.get(item.spaceId);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-sm shadow-sm"
                  >
                    <div className="min-w-0 truncate text-slate-600">
                      <span className="font-semibold text-slate-900">
                        {space?.name ?? "合作空间"}
                      </span>
                      <span className="mx-2 text-slate-300">/</span>
                      <span>{item.title}</span>
                    </div>
                    <div className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
                      {item.time}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-6">
          <section className="rounded-[32px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  我的系统表单
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  分配到你名下的系统表单
                </h2>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                {myForms.length} 张表单
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              {myForms.map((form) => {
                const space = spaceMap.get(form.spaceId);
                const tone = getToneClasses(space?.tone ?? "blue");

                return (
                  <article
                    key={form.id}
                    className={`rounded-[28px] border p-5 shadow-sm ${tone.surface}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${tone.badge}`}
                      >
                        {form.formType}
                      </div>
                      <div
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getFormStateClasses(form.state)}`}
                      >
                        {form.state}
                      </div>
                    </div>
                    <h3 className="mt-6 text-xl font-semibold tracking-tight text-slate-950">
                      {form.title}
                    </h3>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>所属空间：{space?.name}</p>
                      <p>分配人：{form.assignerName}</p>
                      <p>最近更新：{form.updatedAt}</p>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
                        进入表单
                      </button>
                      {space ? (
                        <Link
                          href={getWorkspaceHref(space.id)}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                        >
                          查看空间
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[32px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    我创建的空间
                  </h2>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  {createdSpaces.length} 个
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {createdSpaces.map((space) => {
                  const tone = getToneClasses(space.tone);

                  return (
                    <article
                      key={space.id}
                      className={`rounded-[28px] border p-5 shadow-sm ${tone.surface}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                            {space.name}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {space.summary}
                          </p>
                        </div>
                        <div
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${tone.badge}`}
                        >
                          创建者
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          文档 {space.documentCount}
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          系统表单 {space.systemFormCount}
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          最近更新 {space.updatedAt}
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <DissolveCollaborationSpaceButton
                          spaceId={space.id}
                          spaceName={space.name}
                          compact
                        />
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-4">
                        <div className="flex -space-x-2">
                          {space.memberEmails.slice(0, 4).map((memberEmail) => {
                            const account = accountMap.get(normalizeWorkspaceEmail(memberEmail));
                            return (
                              <div
                                key={memberEmail}
                                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-sm font-semibold text-slate-700"
                                title={account?.name ?? memberEmail}
                              >
                                {initials(account?.name ?? memberEmail)}
                              </div>
                            );
                          })}
                        </div>
                        <Link
                          href={getWorkspaceHref(space.id)}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                        >
                          进入空间
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    我加入的空间
                  </h2>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  {joinedSpaces.length} 个
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {joinedSpaces.map((space) => {
                  const tone = getToneClasses(space.tone);
                  const owner = accountMap.get(normalizeWorkspaceEmail(space.ownerEmail));

                  return (
                    <article
                      key={space.id}
                      className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                            {space.name}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {space.summary}
                          </p>
                        </div>
                        <div
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${tone.badge}`}
                        >
                          创建者：{owner?.name ?? "未命名"}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          文档 {space.documentCount}
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          系统表单 {space.systemFormCount}
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          最近更新 {space.updatedAt}
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-4">
                        <div className="flex -space-x-2">
                          {space.memberEmails.slice(0, 4).map((memberEmail) => {
                            const account = accountMap.get(normalizeWorkspaceEmail(memberEmail));
                            return (
                              <div
                                key={memberEmail}
                                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-sm font-semibold text-slate-700"
                                title={account?.name ?? memberEmail}
                              >
                                {initials(account?.name ?? memberEmail)}
                              </div>
                            );
                          })}
                        </div>
                        <Link
                          href={getWorkspaceHref(space.id)}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                        >
                          进入空间
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
