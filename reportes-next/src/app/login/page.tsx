import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginClient } from './LoginClient'

export const metadata: Metadata = {
  title: 'Ingresar | Cpanel',
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  )
}
