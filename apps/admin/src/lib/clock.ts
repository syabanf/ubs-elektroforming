import { toLocalIso } from '@ef/fixtures'
import { useEffect, useState } from 'react'

/** The current local time as `YYYY-MM-DDTHH:mm`, refreshed every minute so "x lalu" labels move. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => toLocalIso(new Date()))
  useEffect(() => {
    const id = setInterval(() => setNow(toLocalIso(new Date())), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
