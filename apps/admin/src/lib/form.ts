/** Parses a typed number, accepting the Indonesian decimal comma. Empty input is `null`, junk is `NaN`. */
export function parseNum(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return Number(trimmed.replace(/\s/g, '').replace(',', '.'))
}

/** A stored number as input text; `scale` 100 shows a fraction as a percentage. */
export function toInput(value: number | null, scale = 1): string {
  if (value === null) return ''
  return String(Number((value * scale).toFixed(6))).replace('.', ',')
}

/** Error text for a numeric field, or null when the value is acceptable. */
export function numberError(
  value: number | null,
  { required = false, min, max, label }: { required?: boolean; min?: number; max?: number; label: string },
): string | null {
  if (value === null)
    return required
      ? `Isi ${/^[A-Z][a-z]/.test(label) ? label[0]!.toLowerCase() + label.slice(1) : label}.`
      : null
  if (Number.isNaN(value)) return `${label} harus berupa angka.`
  if (min !== undefined && value < min) return `${label} minimal ${String(min).replace('.', ',')}.`
  if (max !== undefined && value > max) return `${label} maksimal ${String(max).replace('.', ',')}.`
  return null
}
