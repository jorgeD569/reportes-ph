import { AuthGuard } from '@/components/auth/AuthGuard'
import { OperadorCargaHeader } from '@/app/(operador-carga)/OperadorCargaHeader'

export default function OperadorCargaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen overflow-x-hidden bg-app text-app">
        <OperadorCargaHeader />
        <main className="mx-auto w-full min-w-0 max-w-full overflow-x-hidden px-4 py-6 sm:px-6 md:py-8 lg:max-w-6xl lg:px-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
