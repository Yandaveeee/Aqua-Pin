export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      public_profiles: {
        Row: {
          id: string
          email: string
          role: 'admin' | 'field_staff'
          status: 'pending' | 'approved'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'admin' | 'field_staff'
          status?: 'pending' | 'approved'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'admin' | 'field_staff'
          status?: 'pending' | 'approved'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          section: string
          value: Json
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          section: string
          value?: Json
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          section?: string
          value?: Json
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_settings_audit: {
        Row: {
          id: string
          section: string
          previous_value: Json | null
          new_value: Json
          changed_by: string
          changed_at: string
        }
        Insert: {
          id?: string
          section: string
          previous_value?: Json | null
          new_value: Json
          changed_by: string
          changed_at?: string
        }
        Update: {
          id?: string
          section?: string
          previous_value?: Json | null
          new_value?: Json
          changed_by?: string
          changed_at?: string
        }
        Relationships: []
      }
      admin_access_audit: {
        Row: {
          id: string
          target_user_id: string
          previous_status: 'pending' | 'approved'
          new_status: 'pending' | 'approved'
          changed_by: string
          changed_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          target_user_id: string
          previous_status: 'pending' | 'approved'
          new_status: 'pending' | 'approved'
          changed_by: string
          changed_at?: string
          notes?: string | null
        }
        Update: {
          id?: string
          target_user_id?: string
          previous_status?: 'pending' | 'approved'
          new_status?: 'pending' | 'approved'
          changed_by?: string
          changed_at?: string
          notes?: string | null
        }
        Relationships: []
      }
      ponds: {
        Row: {
          id: string
          name: string
          location: unknown // PostGIS geometry
          created_by: string
          created_at: string
          boundary: string | null
          is_active: boolean
          current_species: string | null
          current_stock_count: number | null
        }
        Insert: {
          id?: string
          name: string
          location: unknown
          created_by: string
          created_at?: string
          boundary?: string | null
          is_active?: boolean
          current_species?: string | null
          current_stock_count?: number | null
        }
        Update: {
          id?: string
          name?: string
          location?: unknown
          created_by?: string
          created_at?: string
          boundary?: string | null
          is_active?: boolean
          current_species?: string | null
          current_stock_count?: number | null
        }
        Relationships: []
      }
      mortality_logs: {
        Row: {
          id: string
          pond_id: string
          quantity: number
          notes: string | null
          logged_by: string
          created_at: string
        }
        Insert: {
          id?: string
          pond_id: string
          quantity: number
          notes?: string | null
          logged_by: string
          created_at?: string
        }
        Update: {
          id?: string
          pond_id?: string
          quantity?: number
          notes?: string | null
          logged_by?: string
          created_at?: string
        }
        Relationships: []
      }
      harvests: {
        Row: {
          id: string
          pond_id: string
          yield_kg: number
          harvested_by: string
          created_at: string
          species: string | null
          is_partial: boolean
          fish_count: number | null
        }
        Insert: {
          id?: string
          pond_id: string
          yield_kg: number
          harvested_by: string
          created_at?: string
          species?: string | null
          is_partial?: boolean
          fish_count?: number | null
        }
        Update: {
          id?: string
          pond_id?: string
          yield_kg?: number
          harvested_by?: string
          created_at?: string
          species?: string | null
          is_partial?: boolean
          fish_count?: number | null
        }
        Relationships: []
      }
      stocking_logs: {
        Row: {
          id: string
          pond_id: string
          species: string
          quantity: number
          average_weight_g: number | null
          source: string | null
          stocked_by: string
          created_at: string
          status: string
        }
        Insert: {
          id?: string
          pond_id: string
          species: string
          quantity: number
          average_weight_g?: number | null
          source?: string | null
          stocked_by: string
          created_at?: string
          status?: string
        }
        Update: {
          id?: string
          pond_id?: string
          species?: string
          quantity?: number
          average_weight_g?: number | null
          source?: string | null
          stocked_by?: string
          created_at?: string
          status?: string
        }
        Relationships: []
      }
      pond_history: {
        Row: {
          id: string
          pond_id: string
          event_type: string
          event_data: Json | null
          recorded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          pond_id: string
          event_type: string
          event_data?: Json | null
          recorded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          pond_id?: string
          event_type?: string
          event_data?: Json | null
          recorded_by?: string
          created_at?: string
        }
        Relationships: []
      }
      feed_inventory_items: {
        Row: {
          id: string
          feed_brand: string
          remaining_bags: number
          threshold_bags: number
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          feed_brand: string
          remaining_bags?: number
          threshold_bags?: number
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          feed_brand?: string
          remaining_bags?: number
          threshold_bags?: number
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      feed_logs: {
        Row: {
          id: string
          pond_id: string | null
          type: 'purchase' | 'consumption' | 'adjustment'
          feed_brand: string
          quantity_bags: number
          notes: string | null
          logged_by: string
          created_at: string
        }
        Insert: {
          id?: string
          pond_id?: string | null
          type: 'purchase' | 'consumption' | 'adjustment'
          feed_brand: string
          quantity_bags: number
          notes?: string | null
          logged_by: string
          created_at?: string
        }
        Update: {
          id?: string
          pond_id?: string | null
          type?: 'purchase' | 'consumption' | 'adjustment'
          feed_brand?: string
          quantity_bags?: number
          notes?: string | null
          logged_by?: string
          created_at?: string
        }
        Relationships: []
      }
      stocking_plans: {
        Row: {
          id: string
          pond_id: string
          species: string
          quantity: number
          average_weight_g: number
          planned_date: string
          feed_budget_bags: number
          planned_by: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          pond_id: string
          species: string
          quantity: number
          average_weight_g?: number
          planned_date: string
          feed_budget_bags?: number
          planned_by: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          pond_id?: string
          species?: string
          quantity?: number
          average_weight_g?: number
          planned_date?: string
          feed_budget_bags?: number
          planned_by?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_approved_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      admin_approve_staff: {
        Args: {
          target_user_id: string
          notes?: string | null
        }
        Returns: Database['public']['Tables']['public_profiles']['Row']
      }
      admin_upsert_setting: {
        Args: {
          p_section: string
          p_value: Json
        }
        Returns: Database['public']['Tables']['admin_settings']['Row']
      }
    }
    Enums: {
      user_role: 'admin' | 'field_staff'
      user_status: 'pending' | 'approved'
    }
  }
}
