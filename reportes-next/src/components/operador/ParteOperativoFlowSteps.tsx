const steps = [
  { id: 'alta', label: 'Alta del parte' },
  { id: 'observaciones', label: 'Observaciones' },
  { id: 'servicios', label: 'Servicios y cierre' },
] as const

const closedStep = { id: 'cerrado', label: 'Parte cerrado' } as const

export type ParteOperativoFlowStep = (typeof steps)[number]['id']

type FlowStep = (typeof steps)[number] | typeof closedStep

function stepStyles(done: boolean, active: boolean) {
  const bg = active ? '#2563eb' : done ? '#16a34a' : '#e5e7eb'
  const border = active ? '#1d4ed8' : done ? '#15803d' : '#9ca3af'
  const color = active || done ? '#ffffff' : '#111827'

  return { bg, border, color }
}

function FlowStepPill({
  step,
  index,
  done,
  active,
  showConnector,
}: {
  step: FlowStep
  index: number
  done: boolean
  active: boolean
  showConnector: boolean
}) {
  const { bg, border, color } = stepStyles(done, active)

  return (
    <li className="flex min-w-0 max-w-full items-center gap-2 sm:gap-3">
      <span
        className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:text-sm"
        style={{ backgroundColor: bg, borderColor: border, color }}
      >
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
          style={{
            backgroundColor: active || done ? 'rgba(255,255,255,0.25)' : '#ffffff',
            color,
          }}
        >
          {done ? '✓' : index + 1}
        </span>

        <span className="min-w-0 break-words">{step.label}</span>
      </span>

      {showConnector ? (
        <span className="hidden h-px w-6 bg-border sm:block" aria-hidden />
      ) : null}
    </li>
  )
}

export function ParteOperativoFlowSteps({
  current,
  parteCerrado = false,
}: {
  current: ParteOperativoFlowStep
  parteCerrado?: boolean
}) {
  const currentIndex = steps.findIndex((s) => s.id === current)
  const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex

  const displaySteps: FlowStep[] = parteCerrado ? [...steps, closedStep] : [...steps]

  return (
    <ol className="flex max-w-full flex-wrap items-center gap-2 overflow-x-hidden sm:gap-3">
      {displaySteps.map((step, index) => {
        const done = parteCerrado || index < safeCurrentIndex
        const active = !parteCerrado && index === safeCurrentIndex

        return (
          <FlowStepPill
            key={step.id}
            step={step}
            index={index}
            done={done}
            active={active}
            showConnector={index < displaySteps.length - 1}
          />
        )
      })}
    </ol>
  )
}
