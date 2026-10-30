import { Toaster, TooltipProvider } from '@ef/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { router } from './router'
import { ScadaProvider } from './state/scada'
import { AppStateProvider } from './state/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <ScadaProvider>
        <TooltipProvider delayDuration={200}>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </ScadaProvider>
    </AppStateProvider>
  </StrictMode>,
)
