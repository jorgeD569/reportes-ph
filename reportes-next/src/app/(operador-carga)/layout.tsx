export default function OperadorCargaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-app text-app">
      <header className="border-b border-border bg-surface shadow-[var(--shadow-app)]">
        <div className="mx-auto flex max-w-5xl min-w-0 items-center gap-3 px-4 py-4 md:px-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f1f2d] text-sm font-extrabold text-white">
            K
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Kompass - Operador
            </div>
            <div className="text-base font-semibold text-app md:text-lg">
              Carga de parte operativo
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-full overflow-x-hidden px-4 py-6 sm:px-6 md:py-8 lg:max-w-6xl lg:px-8">
        {children}
      </main>
    </div>
  )
}
