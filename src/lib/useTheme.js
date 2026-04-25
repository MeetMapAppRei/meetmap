import { useContext } from 'react'
import { ThemeContext } from './themeContextBase'

export function useTheme() {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme must be used within ThemeProvider')
  return v
}
