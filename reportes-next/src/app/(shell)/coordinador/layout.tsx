import { CoordinadorThemeProvider } from '@/components/coordinador/CoordinadorThemeProvider'

export default function CoordinadorLayout({ children }: { children: React.ReactNode }) {
  return <CoordinadorThemeProvider>{children}</CoordinadorThemeProvider>
}
