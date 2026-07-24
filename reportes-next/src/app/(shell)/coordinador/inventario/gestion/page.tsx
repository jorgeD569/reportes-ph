import { redirect } from 'next/navigation'
import { routes } from '@/lib/constants/routes'

/** Conserva enlaces antiguos al hub administrativo. */
export default function CoordinadorInventarioGestionRedirectPage() {
  redirect(routes.coordinador.gestion.sistema)
}
