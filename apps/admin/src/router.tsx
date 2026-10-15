import { createBrowserRouter } from 'react-router'
import { AppLayout } from './layouts/AppLayout'

const page = (load: () => Promise<Record<string, unknown>>, name: string) => async () => ({
  Component: (await load())[name] as React.ComponentType,
})

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    HydrateFallback: () => <div className="h-dvh bg-surface" />,
    children: [
      { index: true, lazy: page(() => import('./pages/dashboard/DashboardPage'), 'DashboardPage') },
      { path: 'batches', lazy: page(() => import('./pages/batches/BatchesPage'), 'BatchesPage') },
      { path: 'batches/:id', lazy: page(() => import('./pages/batches/BatchDetailPage'), 'BatchDetailPage') },
      { path: 'monitor', lazy: page(() => import('./pages/monitor/MonitorPage'), 'MonitorPage') },
      { path: 'gpc', lazy: page(() => import('./pages/gpc/GpcPage'), 'GpcPage') },
      { path: 'models', lazy: page(() => import('./pages/models/ModelsPage'), 'ModelsPage') },
      { path: 'reports', lazy: page(() => import('./pages/reports/ReportsPage'), 'ReportsPage') },
      { path: 'reports/:code', lazy: page(() => import('./pages/reports/ReportPage'), 'ReportPage') },
      { path: 'formulas', lazy: page(() => import('./pages/formulas/FormulasPage'), 'FormulasPage') },
    ],
  },
])
