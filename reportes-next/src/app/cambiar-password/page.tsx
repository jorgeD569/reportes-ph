import type { Metadata } from 'next'
import { CambiarPasswordClient } from '@/app/cambiar-password/CambiarPasswordClient'

export const metadata: Metadata = {
  title: 'Cambiar contraseña | Cpanel',
}

export default function CambiarPasswordPage() {
  return <CambiarPasswordClient />
}
