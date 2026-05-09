import { getPublicApiBaseUrl } from '@/lib/env'

export type ApiErrorDetails = {
  status: number
  message: string
  details?: unknown
}

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor({ status, message, details }: ApiErrorDetails) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

type JsonRecord = Record<string, unknown>

type RequestOptions = Omit<RequestInit, 'method' | 'body'> & {
  headers?: Record<string, string>
}

function buildUrl(path: string) {
  const baseUrl = getPublicApiBaseUrl()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${cleanPath}`
}

async function parseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return await res.json()
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function extractMessage(parsed: unknown): string | null {
  if (!parsed) return null

  if (typeof parsed === 'string') return parsed

  if (typeof parsed === 'object') {
    const obj = parsed as JsonRecord
    const error = obj.error
    if (typeof error === 'string') return error
    const message = obj.message
    if (typeof message === 'string') return message
  }

  return null
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const url = buildUrl(path)

  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  })

  const parsed = await parseBody(res)

  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      message:
        extractMessage(parsed) ||
        `HTTP ${res.status} ${res.statusText}`.trim(),
      details: parsed,
    })
  }

  return parsed as T
}

export async function get<T>(path: string, options?: RequestOptions) {
  return request<T>('GET', path, undefined, options)
}

export async function post<T>(
  path: string,
  body: unknown,
  options?: RequestOptions
) {
  return request<T>('POST', path, body, options)
}

export async function put<T>(
  path: string,
  body: unknown,
  options?: RequestOptions
) {
  return request<T>('PUT', path, body, options)
}

