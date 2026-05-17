import { cn } from '@/lib/cn'

const steps = [
  { id: 'alta', label: 'Alta del parte' },
  { id: 'observaciones', label: 'Observaciones' },
  { id: 'servicios', label: 'Servicios y cierre' },
] as const

export type ParteOperativoFlowStep = (typeof steps)[number]['id']

export function ParteOperativoFlowSteps({
  current,
}: {
  current: ParteOperativoFlowStep
}) {
  const currentIndex = steps.findIndex((s) => s.id === current)

  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
      {steps.map((step, index) => {
        const done = index < currentIndex
        const active = step.id === current

        return (
          <li key={step.id} className="flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:text-sm',
                active
                  ? 'border-[#0f1f2d] bg-[#0f1f2d] text-white'
                  : done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-border bg-surface text-muted'
              )}
            >
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full text-[10px]',
                  active
                    ? 'bg-white/20 text-white'
                    : done
                    ? 'bg-emerald-600 text-white'
                    : 'bg-surface-2 text-muted'
                )}
              >
                {done ? '✓' : index + 1}
              </span>
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span className="hidden h-px w-6 bg-border sm:block" aria-hidden />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
