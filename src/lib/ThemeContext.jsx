import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark') // 'dark' | 'light'

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'light' || stored === 'dark') setTheme(stored)
    } catch {
      // Ignore storage errors
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // Ignore storage errors
    }
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      isLight: theme === 'light',
      toggleTheme: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
      setTheme,
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme must be used within ThemeProvider')
  return v
}

