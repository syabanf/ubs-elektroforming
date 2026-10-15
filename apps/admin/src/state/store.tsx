import { type AppAction, type AppState, DEFAULT_BATHS, reduce, seedState } from '@ef/fixtures'
import { createContext, use, useEffect, useMemo, useReducer, useState } from 'react'

const KEY = 'ef.admin.state.v1'
const VERSION = 6

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw) as { version?: number; state?: AppState }
    if (!parsed.state) return seedState()
    if (parsed.version === VERSION) return parsed.state
    // Version 5 kept the baths in code; give its saved data the default bath list.
    if (parsed.version === 5) return { ...parsed.state, baths: DEFAULT_BATHS }
    return seedState()
  } catch {
    return seedState()
  }
}

type Store = {
  state: AppState
  dispatch: (action: AppAction) => void
  storageError: boolean
  reset: () => void
}

const StoreContext = createContext<Store | null>(null)

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, load)
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: VERSION, state }))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [state])

  const store = useMemo<Store>(
    () => ({
      state,
      dispatch,
      storageError,
      reset: () => {
        try {
          localStorage.removeItem(KEY)
        } catch {
          // storage unavailable: the reload falls back to the seed anyway
        }
        window.location.reload()
      },
    }),
    [state, storageError],
  )
  return <StoreContext value={store}>{children}</StoreContext>
}

export function useStore() {
  const store = use(StoreContext)
  if (!store) throw new Error('useStore outside AppStateProvider')
  return store
}
