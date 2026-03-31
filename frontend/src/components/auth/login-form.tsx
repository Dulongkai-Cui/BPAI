"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

type LoginFormProps = {
  defaultEmail: string;
  defaultPassword: string;
  presets?: Array<{
    label: string;
    email: string;
    password: string;
    meta: string;
  }>;
};

export function LoginForm({
  defaultEmail,
  defaultPassword,
  presets = [],
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setErrorMessage(payload?.message ?? "登录失败，请稍后再试。");
        return;
      }

      startTransition(() => {
        router.push("/docs/documents");
        router.refresh();
      });
    } catch {
      setErrorMessage("登录请求失败，请检查本地服务是否正常。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {presets.length ? (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            快速切换测试账号
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {presets.map((preset) => {
              const selected =
                email === preset.email && password === preset.password;

              return (
                <button
                  key={preset.email}
                  type="button"
                  onClick={() => {
                    setEmail(preset.email);
                    setPassword(preset.password);
                    setErrorMessage("");
                  }}
                  className={
                    selected
                      ? "rounded-2xl border border-blue-300 bg-blue-50 px-4 py-3 text-left shadow-sm transition"
                      : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-200 hover:bg-slate-50"
                  }
                >
                  <div className="text-sm font-semibold text-slate-900">
                    {preset.label}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{preset.meta}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          账号邮箱
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder="输入登录邮箱"
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          登录密码
        </label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder="输入登录密码"
          autoComplete="current-password"
        />
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "正在进入 BPAI..." : "登录 BPAI"}
      </button>
    </form>
  );
}
