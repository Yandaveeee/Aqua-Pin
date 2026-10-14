import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 2, // Incremented for new stocking_logs table
  tables: [
    tableSchema({
      name: 'ponds',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'location', type: 'string' }, // Stringified GeoJSON Point
        { name: 'boundary', type: 'string', isOptional: true }, // Stringified polygon coordinates
        { name: 'created_by', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'is_active', type: 'boolean' }, // Active status: has fish currently stocked
        { name: 'current_species', type: 'string', isOptional: true }, // Current fish species
        { name: 'current_stock_count', type: 'number', isOptional: true }, // Estimated current stock
      ]
    }),
    tableSchema({
      name: 'mortality_logs',
      columns: [
        { name: 'pond_id', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'logged_by', type: 'string' },
        { name: 'created_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'harvests',
      columns: [
        { name: 'pond_id', type: 'string', isIndexed: true },
        { name: 'yield_kg', type: 'number' },
        { name: 'harvested_by', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'species', type: 'string', isOptional: true }, // Species harvested
        { name: 'is_partial', type: 'boolean' }, // Partial or full harvest
        { name: 'fish_count', type: 'number', isOptional: true }, // Number of fish harvested
        { name: 'price_per_kg', type: 'number', isOptional: true },
        { name: 'total_revenue', type: 'number', isOptional: true },
        { name: 'is_sold', type: 'boolean', isOptional: true },
      ]
    }),
    tableSchema({
      name: 'stocking_logs',
      columns: [
        { name: 'pond_id', type: 'string', isIndexed: true },
        { name: 'species', type: 'string' }, // Fish species (e.g., 'Tilapia', 'Milkfish')
        { name: 'quantity', type: 'number' }, // Number of fingerlings/juveniles
        { name: 'average_weight_g', type: 'number', isOptional: true }, // Average weight in grams
        { name: 'source', type: 'string', isOptional: true }, // Supplier/hatchery source
        { name: 'stocked_by', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'status', type: 'string' }, // 'active', 'harvested', 'partially_harvested'
      ]
    }),
    tableSchema({
      name: 'pond_history',
      columns: [
        { name: 'pond_id', type: 'string', isIndexed: true },
        { name: 'event_type', type: 'string' }, // 'stocking', 'harvest', 'mortality', 'sampling'
        { name: 'event_data', type: 'string' }, // JSON string of event details
        { name: 'created_at', type: 'number' },
        { name: 'recorded_by', type: 'string' },
      ]
    })
  ]
})
