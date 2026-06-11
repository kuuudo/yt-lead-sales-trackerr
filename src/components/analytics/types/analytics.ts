export type AnalyticsResult = {
  // core KPIs (top-level cards)
  kpis: {
    totalRevenue: number
    totalOrders: number
    conversionRate: number
  }

  // chart-ready data (for line/bar/pie widgets)
  chartData: Array<{
    label: string
    value: number
    timestamp?: string
    category?: string
  }>

  // breakdown for tables / funnels / detail widgets
  breakdown: Array<{
    name: string
    value: number
    percentage?: number
  }>

  // optional metadata for debugging
  meta?: {
    source: 'stripe' | 'pixel' | 'combined'
    dateRange: string
  }
}