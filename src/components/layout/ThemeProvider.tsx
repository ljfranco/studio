"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes/dist/types"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Check for mounted state to avoid hydration mismatch with server render
  // next-themes handles this internally, but this ensures we only render client-side features after mount
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Render children directly on the server or before mount
    // This avoids potential mismatch if ThemeProvider tries to apply theme before hydration
    return <>{children}</>
  }

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
