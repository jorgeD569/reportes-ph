'use client'

import * as React from 'react'
import { COORD_PAGE_INNER, COORD_PAGE_SHELL } from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

const CoordinadorThemeContext = React.createContext(false)

export function useCoordinadorTheme() {
  return React.useContext(CoordinadorThemeContext)
}

export function CoordinadorThemeProvider({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <CoordinadorThemeContext.Provider value={true}>
      <div className={cn('coordinador-theme', COORD_PAGE_SHELL, className)}>
        <div className={COORD_PAGE_INNER}>{children}</div>
      </div>
    </CoordinadorThemeContext.Provider>
  )
}
