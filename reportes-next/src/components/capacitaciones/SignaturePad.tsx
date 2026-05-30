'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

type SignaturePadProps = {
  onChange?: (isEmpty: boolean) => void
  className?: string
  disabled?: boolean
}

export type SignaturePadHandle = {
  clear: () => void
  isEmpty: () => boolean
  toDataURL: () => string | null
}

export const SignaturePad = React.forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ onChange, className, disabled }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const drawingRef = React.useRef(false)
    const emptyRef = React.useRef(true)

    const notifyEmpty = React.useCallback(() => {
      onChange?.(emptyRef.current)
    }, [onChange])

    const getCtx = React.useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return null
      return canvas.getContext('2d')
    }, [])

    const resizeCanvas = React.useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(rect.width * ratio)
      canvas.height = Math.floor(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#0f1f2d'
    }, [])

    React.useEffect(() => {
      resizeCanvas()
      window.addEventListener('resize', resizeCanvas)
      return () => window.removeEventListener('resize', resizeCanvas)
    }, [resizeCanvas])

    const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current!
      const rect = canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return
      e.preventDefault()
      const ctx = getCtx()
      if (!ctx) return
      drawingRef.current = true
      canvasRef.current?.setPointerCapture(e.pointerId)
      const { x, y } = getPoint(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || disabled) return
      e.preventDefault()
      const ctx = getCtx()
      if (!ctx) return
      const { x, y } = getPoint(e)
      ctx.lineTo(x, y)
      ctx.stroke()
      if (emptyRef.current) {
        emptyRef.current = false
        notifyEmpty()
      }
    }

    const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      drawingRef.current = false
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const clear = React.useCallback(() => {
      const canvas = canvasRef.current
      const ctx = getCtx()
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      emptyRef.current = true
      notifyEmpty()
    }, [getCtx, notifyEmpty])

    React.useImperativeHandle(ref, () => ({
      clear,
      isEmpty: () => emptyRef.current,
      toDataURL: () => {
        if (emptyRef.current || !canvasRef.current) return null
        return canvasRef.current.toDataURL('image/png')
      },
    }))

    return (
      <div className={cn('space-y-2', className)}>
        <canvas
          ref={canvasRef}
          className={cn(
            'h-40 w-full touch-none rounded-2xl border border-dashed border-border bg-white dark:bg-surface-2',
            disabled && 'cursor-not-allowed opacity-60'
          )}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          onPointerCancel={endDraw}
        />
        <div className="flex justify-end">
          <button
            type="button"
            className="text-xs font-semibold text-muted hover:text-app disabled:opacity-50"
            onClick={clear}
            disabled={disabled}
          >
            Limpiar firma
          </button>
        </div>
      </div>
    )
  }
)
