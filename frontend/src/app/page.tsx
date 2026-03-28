export default function Home() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "BPAI";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-3xl rounded-3xl border border-surface-border bg-surface p-8 shadow-[0_20px_60px_rgba(16,24,40,0.08)] md:p-12">
        <div className="mb-8 inline-flex rounded-full border border-accent/20 bg-accent/8 px-4 py-1 text-sm font-medium text-accent-strong">
          Docker-ready Next.js frontend
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {appName}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            This is the frontend main project scaffold for BPAI. The local
            development environment runs in Docker, supports hot reload, and is
            structured so backend and database services can be added later
            without rewriting the frontend setup.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-surface-border bg-slate-50 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
              Start editing
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Update <code>frontend/src/app/page.tsx</code> and save the file.
              The running container will refresh the page automatically.
            </p>
          </div>
          <div className="rounded-2xl border border-surface-border bg-slate-50 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
              Future expansion
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Keep the frontend in <code>frontend/</code>. Add future backend
              services beside it in Docker Compose when the project is ready.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
