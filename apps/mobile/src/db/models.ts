import { Model } from '@nozbe/watermelondb'
import { field, date, text, children, readonly } from '@nozbe/watermelondb/decorators'

export class Pond extends Model {
  static table = 'ponds' as const
  
  static associations = {
    mortality_logs: { type: 'has_many' as const, foreignKey: 'pond_id' },
    harvests: { type: 'has_many' as const, foreignKey: 'pond_id' },
    stocking_logs: { type: 'has_many' as const, foreignKey: 'pond_id' },
    pond_history: { type: 'has_many' as const, foreignKey: 'pond_id' },
  }

  @text('name') name!: string
  @text('location') location!: string
  @text('boundary') boundary?: string
  @field('created_by') createdBy!: string
  @date('created_at') createdAt!: number
  
  // Active status fields
  @field('is_active') isActive!: boolean
  @text('current_species') currentSpecies?: string
  @field('current_stock_count') currentStockCount?: number

  @children('mortality_logs') mortalityLogs!: any
  @children('harvests') harvests!: any
  @children('stocking_logs') stockingLogs!: any
  @children('pond_history') pondHistory!: any
}

export class MortalityLog extends Model {
  static table = 'mortality_logs' as const

  @field('pond_id') pondId!: string
  @field('quantity') quantity!: number
  @text('notes') notes?: string
  @field('logged_by') loggedBy!: string
  @date('created_at') createdAt!: number
}

export class Harvest extends Model {
  static table = 'harvests' as const

  @field('pond_id') pondId!: string
  @field('yield_kg') yieldKg!: number
  @field('harvested_by') harvestedBy!: string
  @date('created_at') createdAt!: number
  
  // Enhanced harvest tracking
  @text('species') species?: string
  @field('is_partial') isPartial!: boolean
  @field('fish_count') fishCount?: number
  @field('price_per_kg') pricePerKg?: number
  @field('total_revenue') totalRevenue?: number
  @field('is_sold') isSold?: boolean
}

export class StockingLog extends Model {
  static table = 'stocking_logs' as const

  @field('pond_id') pondId!: string
  @text('species') species!: string
  @field('quantity') quantity!: number
  @field('average_weight_g') averageWeightG?: number
  @text('source') source?: string
  @field('stocked_by') stockedBy!: string
  @date('created_at') createdAt!: number
  @text('status') status!: string // 'active', 'harvested', 'partially_harvested'
}

export class PondHistory extends Model {
  static table = 'pond_history' as const

  @field('pond_id') pondId!: string
  @text('event_type') eventType!: string // 'stocking', 'harvest', 'mortality', 'sampling'
  @text('event_data') eventData!: string // JSON string of event details
  @date('created_at') createdAt!: number
  @field('recorded_by') recordedBy!: string
}
