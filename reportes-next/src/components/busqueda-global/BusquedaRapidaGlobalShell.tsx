'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ResultadosBusquedaGlobal } from '@/components/busqueda-global/ResultadosBusquedaGlobal'
import { ApiError, get } from '@/lib/api'
import { readAppUsuario } from '@/lib/auth'
import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  GLOBAL_SEARCH_LIMIT,
  GLOBAL_SEARCH_PARAM,
} from '@/lib/busqueda-global/constants'
import {
  isValidGlobalSearchQuery,
  normalizeGlobalSearchQuery,
} from '@/lib/busqueda-global/query'
import { getVolverBusquedaGlobalLabel } from '@/lib/busqueda-global/screenLabel'
import { cn } from '@/lib/cn'
import type { GetBusquedaGlobalResponse } from '@/lib/types/busqueda-global'

function buildUrl(
  pathname: string,
  searchParams: URLSearchParams,
  globalSearch: string | null,
): string {
  const params = new URLSearchParams(searchParams.toString())
  const next = globalSearch ? normalizeGlobalSearchQuery(globalSearch) : ''
  if (next) params.set(GLOBAL_SEARCH_PARAM, next)
  else params.delete(GLOBAL_SEARCH_PARAM)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

type BusquedaRapidaGlobalContextValue = {
  input: string
  setInputFromUser: (value: string) => void
  searchActive: boolean
  loading: boolean
  error: string | null
  data: GetBusquedaGlobalResponse | null
  rol: string | null
  volverLabel: string
  inputRef: React.RefObject<HTMLInputElement | null>
  clearSearch: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onRetry: () => void
  focusInput: () => void
}

const BusquedaRapidaGlobalContext =
  React.createContext<BusquedaRapidaGlobalContextValue | null>(null)

export function useBusquedaRapidaGlobal() {
  const ctx = React.useContext(BusquedaRapidaGlobalContext)
  if (!ctx) {
    throw new Error(
      'useBusquedaRapidaGlobal debe usarse dentro de BusquedaRapidaGlobalProvider',
    )
  }
  return ctx
}

function useBusquedaRapidaGlobalOptional() {
  return React.useContext(BusquedaRapidaGlobalContext)
}

export function BusquedaRapidaGlobalProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlSearch = searchParams.get(GLOBAL_SEARCH_PARAM) ?? ''

  const [input, setInput] = React.useState(urlSearch)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<GetBusquedaGlobalResponse | null>(null)
  const [rol, setRol] = React.useState<string | null>(null)

  const abortRef = React.useRef<AbortController | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const enteredSearchRef = React.useRef(Boolean(urlSearch))
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const skipUrlSyncRef = React.useRef(false)
  const lastFetchedRef = React.useRef<string>('')

  const searchActive = isValidGlobalSearchQuery(input)
  const volverLabel = getVolverBusquedaGlobalLabel(pathname)

  React.useEffect(() => {
    React.startTransition(() => {
      setRol(readAppUsuario()?.rol ?? null)
    })
  }, [])

  React.useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false
      return
    }
    React.startTransition(() => {
      setInput(urlSearch)
      if (!isValidGlobalSearchQuery(urlSearch)) {
        setData(null)
        setError(null)
        setLoading(false)
        lastFetchedRef.current = ''
        enteredSearchRef.current = false
      }
    })
  }, [urlSearch])

  const writeUrl = React.useCallback(
    (value: string, mode: 'push' | 'replace') => {
      const next = normalizeGlobalSearchQuery(value)
      const current = searchParams.get(GLOBAL_SEARCH_PARAM) ?? ''
      const valid = isValidGlobalSearchQuery(next)

      if (!valid) {
        if (!searchParams.has(GLOBAL_SEARCH_PARAM)) return
        skipUrlSyncRef.current = true
        const url = buildUrl(pathname, searchParams, null)
        router.replace(url, { scroll: false })
        enteredSearchRef.current = false
        return
      }

      if (current === next) return

      skipUrlSyncRef.current = true
      const url = buildUrl(pathname, searchParams, next)
      if (mode === 'push' || (!current && !enteredSearchRef.current)) {
        router.push(url, { scroll: false })
        enteredSearchRef.current = true
      } else {
        router.replace(url, { scroll: false })
      }
    },
    [pathname, router, searchParams],
  )

  const runSearch = React.useCallback(async (raw: string) => {
    const q = normalizeGlobalSearchQuery(raw)
    if (!isValidGlobalSearchQuery(q)) {
      abortRef.current?.abort()
      setLoading(false)
      setError(null)
      setData(null)
      lastFetchedRef.current = ''
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)

    try {
      const res = await get<GetBusquedaGlobalResponse>(
        `/busqueda-global?q=${encodeURIComponent(q)}&limit=${GLOBAL_SEARCH_LIMIT}`,
        { signal: ac.signal },
      )
      if (ac.signal.aborted) return
      lastFetchedRef.current = q
      setData(res)
    } catch (e) {
      if (ac.signal.aborted) return
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (e instanceof Error && e.name === 'AbortError') return
      lastFetchedRef.current = ''
      if (e instanceof ApiError) setError(e.message)
      else setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!isValidGlobalSearchQuery(urlSearch)) return
    if (lastFetchedRef.current === urlSearch) return
    void runSearch(urlSearch)
  }, [urlSearch, runSearch])

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const focusInput = React.useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const clearSearch = React.useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    setInput('')
    setData(null)
    setError(null)
    setLoading(false)
    lastFetchedRef.current = ''
    writeUrl('', 'replace')
    focusInput()
  }, [writeUrl, focusInput])

  const setInputFromUser = React.useCallback(
    (value: string) => {
      setInput(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const q = normalizeGlobalSearchQuery(value)
        if (!isValidGlobalSearchQuery(q)) {
          writeUrl('', 'replace')
          setData(null)
          setError(null)
          setLoading(false)
          lastFetchedRef.current = ''
          return
        }
        writeUrl(q, 'push')
      }, GLOBAL_SEARCH_DEBOUNCE_MS)
    },
    [writeUrl],
  )

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        clearSearch()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (debounceRef.current) clearTimeout(debounceRef.current)
        const q = normalizeGlobalSearchQuery(input)
        if (!isValidGlobalSearchQuery(q)) {
          clearSearch()
          return
        }
        writeUrl(q, 'push')
        void runSearch(q)
      }
    },
    [clearSearch, input, runSearch, writeUrl],
  )

  const onRetry = React.useCallback(() => {
    lastFetchedRef.current = ''
    void runSearch(input)
  }, [input, runSearch])

  const value = React.useMemo<BusquedaRapidaGlobalContextValue>(
    () => ({
      input,
      setInputFromUser,
      searchActive,
      loading,
      error,
      data,
      rol,
      volverLabel,
      inputRef,
      clearSearch,
      onKeyDown,
      onRetry,
      focusInput,
    }),
    [
      input,
      setInputFromUser,
      searchActive,
      loading,
      error,
      data,
      rol,
      volverLabel,
      clearSearch,
      onKeyDown,
      onRetry,
      focusInput,
    ],
  )

  return (
    <BusquedaRapidaGlobalContext.Provider value={value}>
      {children}
    </BusquedaRapidaGlobalContext.Provider>
  )
}

/** Campo compacto para el Topbar (sin tarjeta ni textos auxiliares). */
export function BusquedaRapidaTopbarControl() {
  const ctx = useBusquedaRapidaGlobalOptional()
  const [mobileExpanded, setMobileExpanded] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  const mobileOpen = Boolean(
    mobileExpanded || ctx?.searchActive || ctx?.input,
  )

  React.useEffect(() => {
    if (!mobileOpen || !ctx) return
    function onDoc(e: MouseEvent) {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target) && !ctx?.input) {
        setMobileExpanded(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [mobileOpen, ctx])

  if (!ctx) return null

  const {
    input,
    setInputFromUser,
    clearSearch,
    onKeyDown,
    inputRef,
    focusInput,
  } = ctx

  return (
    <div ref={rootRef} className="flex min-w-0 items-center justify-center gap-2">
      <button
        type="button"
        aria-label="Abrir búsqueda rápida"
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:bg-surface-2 hover:text-app md:hidden',
          mobileOpen && 'hidden',
        )}
        onClick={() => {
          setMobileExpanded(true)
          focusInput()
        }}
      >
        <SearchGlyph className="h-4 w-4" />
      </button>

      <div
        className={cn(
          'relative w-full max-w-[320px]',
          mobileOpen ? 'block w-[min(70vw,320px)]' : 'hidden md:block',
        )}
      >
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted">
          <SearchGlyph className="h-3.5 w-3.5" />
        </span>
        <input
          ref={inputRef}
          className={cn(
            'h-9 w-full rounded-xl border border-border bg-surface-2/70 px-3 pl-8 text-sm text-app outline-none',
            'placeholder:text-muted/70',
            'focus:border-border focus:ring-1 focus:ring-sky-400/25',
            'pr-8 normal-case',
          )}
          placeholder="Buscar activo, parte o PH…"
          value={input}
          aria-label="Búsqueda rápida"
          onChange={(e) => setInputFromUser(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {input ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda rápida"
            className="absolute inset-y-0 right-1 my-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-app"
            onClick={clearSearch}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M16.2 16.2 21 21"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Envuelve el contenido de cada pantalla:
 * con búsqueda activa muestra resultados; el children permanece montado (hidden).
 */
export function BusquedaRapidaGlobalShell({
  children,
}: {
  children: React.ReactNode
}) {
  const {
    searchActive,
    input,
    loading,
    error,
    data,
    rol,
    volverLabel,
    clearSearch,
    onRetry,
  } = useBusquedaRapidaGlobal()

  return (
    <div className="w-full min-w-0">
      {searchActive ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 px-3 text-xs font-semibold text-app transition hover:opacity-90"
            onClick={clearSearch}
          >
            {volverLabel}
          </button>
          <p className="text-sm font-semibold text-app">Resultados de búsqueda</p>
        </div>
      ) : null}

      {searchActive ? (
        <ResultadosBusquedaGlobal
          query={normalizeGlobalSearchQuery(input)}
          loading={loading}
          error={error}
          data={data}
          rol={rol}
          onRetry={onRetry}
          onClear={clearSearch}
        />
      ) : null}

      <div
        className={cn(searchActive && 'hidden')}
        aria-hidden={searchActive || undefined}
      >
        {children}
      </div>
    </div>
  )
}
