import Link from 'next/link'
import { cn } from '@/lib/cn'
import {
  COORD_BTN_DANGER,
  COORD_BTN_PRIMARY,
  COORD_BTN_PRIMARY_LG,
  COORD_BTN_SECONDARY,
  COORD_BTN_SECONDARY_LG,
} from '@/lib/coordinador/theme'

type Variant = 'primary' | 'secondary' | 'danger'
type Size = 'md' | 'lg'

const variantClass: Record<Variant, Record<Size, string>> = {
  primary: { md: COORD_BTN_PRIMARY, lg: COORD_BTN_PRIMARY_LG },
  secondary: { md: COORD_BTN_SECONDARY, lg: COORD_BTN_SECONDARY_LG },
  danger: { md: COORD_BTN_DANGER, lg: COORD_BTN_DANGER },
}

type CommonProps = {
  variant?: Variant
  size?: Size
  className?: string
  children: React.ReactNode
}

export function CoordinadorButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(variantClass[variant][size], className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function CoordinadorButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: CommonProps & { href: string }) {
  return (
    <Link href={href} className={cn(variantClass[variant][size], className)}>
      {children}
    </Link>
  )
}
