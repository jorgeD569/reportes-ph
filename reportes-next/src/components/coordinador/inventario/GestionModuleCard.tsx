import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/Card'
import { COORD_BTN_PRIMARY_LG, COORD_SECTION_MUTED, COORD_SECTION_TITLE } from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

export function GestionModuleCard({
  title,
  description,
  actionLabel,
  href,
  disabled = false,
}: {
  title: string
  description: string
  actionLabel: string
  href?: string
  disabled?: boolean
}) {
  return (
    <Card
      className={cn(
        'flex h-full flex-col transition hover:shadow-[0_28px_64px_rgba(0,0,0,0.4)]',
        disabled && 'opacity-90'
      )}
    >
      <CardBody className="flex flex-1 flex-col gap-5 p-6">
        <div className="min-w-0 flex-1">
          <h2 className={COORD_SECTION_TITLE}>{title}</h2>
          <p className={cn(COORD_SECTION_MUTED, 'leading-relaxed')}>{description}</p>
        </div>
        {disabled || !href ? (
          <button type="button" disabled className={cn(COORD_BTN_PRIMARY_LG, 'w-full')}>
            {actionLabel}
          </button>
        ) : (
          <Link href={href} className={cn(COORD_BTN_PRIMARY_LG, 'w-full')}>
            {actionLabel}
          </Link>
        )}
      </CardBody>
    </Card>
  )
}
