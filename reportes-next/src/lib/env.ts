export function getPublicApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!baseUrl) {
    throw new Error(
      'Missing NEXT_PUBLIC_API_BASE_URL. Add it to .env.local (e.g. https://reportes-ph.onrender.com).'
    )
  }
  return baseUrl.replace(/\/+$/, '')
}

