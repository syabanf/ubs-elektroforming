export type BatchTab = 'prep' | 'log' | 'result'

export const paths = {
  dashboard: '/',
  batches: '/batches',
  batch: (id: string, tab?: BatchTab) => `/batches/${id}${tab ? `?tab=${tab}` : ''}`,
  models: '/models',
  monitor: '/monitor',
  monitorBath: (bathId: string) => `/monitor?lihat=bath:${bathId}`,
  gpc: '/gpc',
  formulas: '/formulas',
}
