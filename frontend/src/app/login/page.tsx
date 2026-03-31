import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import {
  getBootstrapAccountSummaries,
  getBootstrapAccountSummary,
  getCurrentUser,
  readAppStore,
} from "@/lib/auth/server";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/docs/documents");
  }

  await readAppStore();
  const bootstrapAccount = getBootstrapAccountSummary();
  const bootstrapAccounts = getBootstrapAccountSummaries();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(191,219,254,0.32),transparent_28%),linear-gradient(180deg,#eef4ff_0%,#f7f9fd_38%,#eef3fb_100%)] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_520px]">
          <section className="overflow-hidden rounded-[40px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/90 px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-blue-700 uppercase">
              账号入口
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              登录我的 BPAI
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-500 md:text-lg">
              先从第一个真实用户起步：账号、会话、个人工作区和后续文档内容链路，都以同一套身份上下文承接。
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  用户对象
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-900">
                  真实身份
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  先固定到你的账号、角色和团队。
                </p>
              </div>
              <div className="rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  会话入口
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-900">
                  BFF / API
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  登录鉴权、会话上下文和当前用户由这一层承接。
                </p>
              </div>
              <div className="rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  工作区
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-900">
                  个人主工作区
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  后续文档上传、编辑与保存都在这里归属。
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[36px] border border-white/80 bg-white/92 p-7 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur md:p-8">
            <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(255,255,255,0.94))] p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    当前账号
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {bootstrapAccount.name}
                  </div>
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  首位用户
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    角色
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {bootstrapAccount.roleLabel}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    团队
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {bootstrapAccount.teamLabel}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-blue-100 bg-blue-50/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                  本地初始化账号
                </div>
                <div className="mt-3 space-y-2 text-sm text-blue-900">
                  <p>
                    邮箱：<span className="font-semibold">{bootstrapAccount.email}</span>
                  </p>
                  <p>
                    初始密码：<span className="font-semibold">{bootstrapAccount.password}</span>
                  </p>
                  <p className="text-blue-700/80">
                    当前已预置 {bootstrapAccounts.length} 个本地测试账号，可直接切换测试。
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  协作测试账号
                </div>
                <div className="mt-4 grid gap-3">
                  {bootstrapAccounts.map((account, index) => (
                    <div
                      key={account.email}
                      className={
                        index === 0
                          ? "rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3"
                          : "rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">
                          {account.name}
                        </div>
                        {index === 0 ? (
                          <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                            推荐
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {account.roleLabel} / {account.teamLabel}
                      </div>
                      <div className="mt-3 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                        <div>
                          邮箱：<span className="font-semibold">{account.email}</span>
                        </div>
                        <div>
                          密码：<span className="font-semibold">{account.password}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-5">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  进入个人工作区
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  这一步会建立本地会话，并为文档档案室、ONLYOFFICE、后续上传链路提供统一身份上下文。
                </p>
              </div>
              <LoginForm
                defaultEmail={bootstrapAccount.email}
                defaultPassword={bootstrapAccount.password}
                presets={bootstrapAccounts.map((account) => ({
                  label: account.name,
                  email: account.email,
                  password: account.password,
                  meta: `${account.roleLabel} / ${account.teamLabel}`,
                }))}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
