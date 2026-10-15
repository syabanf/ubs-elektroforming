// Display formatting for the console, in Indonesian number style (1.234,5). JSX never formats by hand.
const numberFormats = new Map<string, Intl.NumberFormat>()

function numberFormat(min: number, max: number) {
  const key = `${min}:${max}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat('id-ID', { minimumFractionDigits: min, maximumFractionDigits: max })
    numberFormats.set(key, format)
  }
  return format
}

export const DASH = '–'

export function fmtNumber(value: number | null | undefined, digits = 2, minDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return numberFormat(Math.min(minDigits, digits), digits).format(value)
}

/** A fraction (0.7201) as a percentage (72,01 %). */
export function fmtPercent(fraction: number | null | undefined, digits = 2): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return DASH
  return `${numberFormat(digits, digits).format(fraction * 100)} %`
}

export function fmtSigned(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return `${value > 0 ? '+' : ''}${numberFormat(digits, digits).format(value)}`
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `2026-10-06` → `6 Okt 2026`. */
export function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return dateFormat.format(new Date(y, m - 1, d))
}

export const fmtToday = (now = new Date()) => weekdayFormat.format(now)

export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

/** Hours as `37 j 01 m`. */
const clockFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' })
const shortDateTime = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** `2026-10-14T14:05` → `14.05`, with the date in front when it is not `todayIso`. */
export function fmtClock(localIso: string | null | undefined, today = todayIso()): string {
  if (!localIso) return DASH
  const date = new Date(localIso)
  return localIso.startsWith(today) ? clockFormat.format(date) : shortDateTime.format(date)
}

/** Minutes as `1 j 20 m lalu`, or `baru saja` under a minute. */
export function fmtAgo(minutes: number): string {
  if (minutes < 1) return 'baru saja'
  return minutes < 60 ? `${minutes} m lalu` : `${fmtHours(minutes / 60)} lalu`
}

export function fmtHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return DASH
  const sign = hours < 0 ? '-' : ''
  const total = Math.round(Math.abs(hours) * 60)
  return `${sign}${Math.floor(total / 60)} j ${String(total % 60).padStart(2, '0')} m`
}
