import { catalogOf } from '@ef/fixtures'
import { useMemo } from 'react'
import { useStore } from './store'

/** Models and rack parts by id, for rack lines and batch calculations. */
export function useCatalog() {
  const { models, parts } = useStore().state
  return useMemo(() => catalogOf({ models, parts }), [models, parts])
}
