import { cn } from '@/lib/cn'

/**
 * Branding del sidebar. Para logo + nombre comercial propio, reemplazar
 * `SIDEBAR_BRAND` y/o renderizar `logo` en el slot marcado abajo.
 */
export const SIDEBAR_BRAND = {
  title: 'Cpanel',
  subtitle: 'Sistema de Gestión Operativa',
} as const

export function SidebarBrand({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 px-4 py-4',
        'bg-[linear-gradient(145deg,#0c2c40_0%,#0f1f2d_48%,#13283a_100%)]',
        'shadow-[0_8px_24px_rgba(0,0,0,0.28)]',
        className
      )}
    >
      {/* Slot logo: <img src={...} alt={...} className="mb-3 h-10 w-auto" /> */}
      <div className="flex min-w-0 flex-col items-start justify-center gap-1.5">
        <div className="text-lg font-bold leading-tight tracking-[0.06em] text-white">
          {SIDEBAR_BRAND.title}
        </div>
        <div
          className="h-px w-full bg-gradient-to-r from-sky-400/40 via-white/20 to-transparent"
          aria-hidden
        />
        <p className="text-xs font-medium leading-snug text-sky-200/75">
          {SIDEBAR_BRAND.subtitle}
        </p>
      </div>
    </div>
  )
}
