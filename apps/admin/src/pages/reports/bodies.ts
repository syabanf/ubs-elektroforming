import type { ComponentType } from 'react'
import { ComparisonReport, EfficiencyReport, PredictionReport } from './analysis'
import type { ReportCode } from './catalog'
import { ChemicalReport, GoldBalanceReport } from './material'
import { CompositionReport, ElectricalReport } from './process'
import { DensityReport, ProductionReport, ThicknessReport } from './production'

export const BODIES: Record<ReportCode, ComponentType> = {
  R01: ProductionReport,
  R02: ElectricalReport,
  R03: ThicknessReport,
  R04: DensityReport,
  R05: CompositionReport,
  R06: ChemicalReport,
  R07: GoldBalanceReport,
  R08: EfficiencyReport,
  R09: ComparisonReport,
  R10: PredictionReport,
}
