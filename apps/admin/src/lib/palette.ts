/** Theme colours read from the CSS tokens, so the 3D scenes follow the app palette. */
export type Palette = {
  ink: string
  accent: string
  info: string
  success: string
  warning: string
  muted: string
}

export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(`--color-${name}`).trim()
  return {
    ink: token('ink'),
    accent: token('accent'),
    info: token('info'),
    success: token('success'),
    warning: token('warning'),
    muted: token('muted'),
  }
}
