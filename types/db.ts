export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      campaign_links: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          label: string
          source: Database["public"]["Enums"]["campaign_link_source"]
          url: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          label: string
          source?: Database["public"]["Enums"]["campaign_link_source"]
          url: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          label?: string
          source?: Database["public"]["Enums"]["campaign_link_source"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_tasks: {
        Row: {
          campaign_id: string
          created_at: string
          due_date: string | null
          id: string
          owner: string | null
          status: Database["public"]["Enums"]["campaign_task_status"]
          title: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          owner?: string | null
          status?: Database["public"]["Enums"]["campaign_task_status"]
          title: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          owner?: string | null
          status?: Database["public"]["Enums"]["campaign_task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          type: Database["public"]["Enums"]["campaign_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          type?: Database["public"]["Enums"]["campaign_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          type?: Database["public"]["Enums"]["campaign_type"]
          updated_at?: string
        }
        Relationships: []
      }
      connector_credentials: {
        Row: {
          connector: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          connector: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          connector?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      hubspot_deals: {
        Row: {
          amount: number | null
          close_date: string | null
          company: string | null
          deal_name: string
          id: string
          owner: string | null
          stage: string
          state: string | null
          synced_at: string
        }
        Insert: {
          amount?: number | null
          close_date?: string | null
          company?: string | null
          deal_name: string
          id: string
          owner?: string | null
          stage: string
          state?: string | null
          synced_at?: string
        }
        Update: {
          amount?: number | null
          close_date?: string | null
          company?: string | null
          deal_name?: string
          id?: string
          owner?: string | null
          stage?: string
          state?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      klaviyo_metrics: {
        Row: {
          affiliate_revenue: number | null
          as_of_date: string
          campaigns: Json | null
          click_rate: number | null
          email_revenue: number | null
          flows: Json | null
          open_rate: number | null
          synced_at: string
        }
        Insert: {
          affiliate_revenue?: number | null
          as_of_date: string
          campaigns?: Json | null
          click_rate?: number | null
          email_revenue?: number | null
          flows?: Json | null
          open_rate?: number | null
          synced_at?: string
        }
        Update: {
          affiliate_revenue?: number | null
          as_of_date?: string
          campaigns?: Json | null
          click_rate?: number | null
          email_revenue?: number | null
          flows?: Json | null
          open_rate?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      manufacturing_runs: {
        Row: {
          actual_arrival_date: string | null
          actual_completion_date: string | null
          air_freight_usd: number | null
          air_landed_per_unit_usd: number | null
          air_margin_percent: number | null
          air_margin_per_unit_usd: number | null
          created_at: string
          created_by: string | null
          expected_arrival_date: string | null
          expected_completion_date: string | null
          id: string
          notes: string | null
          product_cost_usd: number | null
          product_id: string | null
          product_name: string
          purchase_order_id: string | null
          quantity: number
          sea_freight_usd: number | null
          sea_landed_per_unit_usd: number | null
          sea_margin_percent: number | null
          sea_margin_per_unit_usd: number | null
          sell_price_per_unit_usd: number | null
          stage: Database["public"]["Enums"]["manufacturing_stage"]
          updated_at: string
          variant: string | null
          vendor_id: string
        }
        Insert: {
          actual_arrival_date?: string | null
          actual_completion_date?: string | null
          air_freight_usd?: number | null
          air_landed_per_unit_usd?: number | null
          air_margin_percent?: number | null
          air_margin_per_unit_usd?: number | null
          created_at?: string
          created_by?: string | null
          expected_arrival_date?: string | null
          expected_completion_date?: string | null
          id?: string
          notes?: string | null
          product_cost_usd?: number | null
          product_id?: string | null
          product_name: string
          purchase_order_id?: string | null
          quantity?: number
          sea_freight_usd?: number | null
          sea_landed_per_unit_usd?: number | null
          sea_margin_percent?: number | null
          sea_margin_per_unit_usd?: number | null
          sell_price_per_unit_usd?: number | null
          stage?: Database["public"]["Enums"]["manufacturing_stage"]
          updated_at?: string
          variant?: string | null
          vendor_id: string
        }
        Update: {
          actual_arrival_date?: string | null
          actual_completion_date?: string | null
          air_freight_usd?: number | null
          air_landed_per_unit_usd?: number | null
          air_margin_percent?: number | null
          air_margin_per_unit_usd?: number | null
          created_at?: string
          created_by?: string | null
          expected_arrival_date?: string | null
          expected_completion_date?: string | null
          id?: string
          notes?: string | null
          product_cost_usd?: number | null
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string | null
          quantity?: number
          sea_freight_usd?: number | null
          sea_landed_per_unit_usd?: number | null
          sea_margin_percent?: number | null
          sea_margin_per_unit_usd?: number | null
          sell_price_per_unit_usd?: number | null
          stage?: Database["public"]["Enums"]["manufacturing_stage"]
          updated_at?: string
          variant?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_runs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_runs_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_runs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_items: {
        Row: {
          cancel_date: string | null
          color: string | null
          created_at: string
          id: string
          line_total: number | null
          product_name: string
          purchase_order_id: string
          quantity: number
          retail_price: number | null
          sku: string | null
          style_number: string | null
          unit_cost: number
        }
        Insert: {
          cancel_date?: string | null
          color?: string | null
          created_at?: string
          id?: string
          line_total?: number | null
          product_name: string
          purchase_order_id: string
          quantity?: number
          retail_price?: number | null
          sku?: string | null
          style_number?: string | null
          unit_cost?: number
        }
        Update: {
          cancel_date?: string | null
          color?: string | null
          created_at?: string
          id?: string
          line_total?: number | null
          product_name?: string
          purchase_order_id?: string
          quantity?: number
          retail_price?: number | null
          sku?: string | null
          style_number?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_payments: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          label: Database["public"]["Enums"]["po_payment_label"]
          paid: boolean
          paid_date: string | null
          purchase_order_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          label?: Database["public"]["Enums"]["po_payment_label"]
          paid?: boolean
          paid_date?: string | null
          purchase_order_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          label?: Database["public"]["Enums"]["po_payment_label"]
          paid?: boolean
          paid_date?: string | null
          purchase_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          name: string
          notes: string | null
          shopify_handle: string | null
          shopify_product_id: string | null
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          name: string
          notes?: string | null
          shopify_handle?: string | null
          shopify_product_id?: string | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          name?: string
          notes?: string | null
          shopify_handle?: string | null
          shopify_product_id?: string | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          currency: string
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string | null
          po_number: string | null
          ship_date: string | null
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          po_number?: string | null
          ship_date?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          po_number?: string | null
          ship_date?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_revenue_by_channel: {
        Row: {
          as_of_date: string
          dtc_revenue: number | null
          wholesale_revenue: number | null
          other_revenue: number | null
          total_revenue: number | null
          classes: Json | null
          synced_at: string
        }
        Insert: {
          as_of_date: string
          dtc_revenue?: number | null
          wholesale_revenue?: number | null
          other_revenue?: number | null
          total_revenue?: number | null
          classes?: Json | null
          synced_at?: string
        }
        Update: {
          as_of_date?: string
          dtc_revenue?: number | null
          wholesale_revenue?: number | null
          other_revenue?: number | null
          total_revenue?: number | null
          classes?: Json | null
          synced_at?: string
        }
        Relationships: []
      }
      qb_financials: {
        Row: {
          ap_due_30: number | null
          ap_total: number | null
          ar_aging_30: number | null
          ar_aging_60: number | null
          ar_aging_90: number | null
          ar_aging_current: number | null
          ar_aging_over_90: number | null
          ar_total: number | null
          as_of_date: string
          cash_position: number | null
          cogs: number | null
          expenses: number | null
          net_income: number | null
          revenue: number | null
          synced_at: string
        }
        Insert: {
          ap_due_30?: number | null
          ap_total?: number | null
          ar_aging_30?: number | null
          ar_aging_60?: number | null
          ar_aging_90?: number | null
          ar_aging_current?: number | null
          ar_aging_over_90?: number | null
          ar_total?: number | null
          as_of_date: string
          cash_position?: number | null
          cogs?: number | null
          expenses?: number | null
          net_income?: number | null
          revenue?: number | null
          synced_at?: string
        }
        Update: {
          ap_due_30?: number | null
          ap_total?: number | null
          ar_aging_30?: number | null
          ar_aging_60?: number | null
          ar_aging_90?: number | null
          ar_aging_current?: number | null
          ar_aging_over_90?: number | null
          ar_total?: number | null
          as_of_date?: string
          cash_position?: number | null
          cogs?: number | null
          expenses?: number | null
          net_income?: number | null
          revenue?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      shopify_metrics: {
        Row: {
          aov: number | null
          as_of_date: string
          order_count: number | null
          revenue: number | null
          synced_at: string
          top_products: Json | null
        }
        Insert: {
          aov?: number | null
          as_of_date: string
          order_count?: number | null
          revenue?: number | null
          synced_at?: string
          top_products?: Json | null
        }
        Update: {
          aov?: number | null
          as_of_date?: string
          order_count?: number | null
          revenue?: number | null
          synced_at?: string
          top_products?: Json | null
        }
        Relationships: []
      }
      slack_identities: {
        Row: {
          email: string | null
          linked_at: string
          slack_user_id: string
          supabase_user_id: string
        }
        Insert: {
          email?: string | null
          linked_at?: string
          slack_user_id: string
          supabase_user_id: string
        }
        Update: {
          email?: string | null
          linked_at?: string
          slack_user_id?: string
          supabase_user_id?: string
        }
        Relationships: []
      }
      slack_notifications: {
        Row: {
          channel: string
          dedupe_key: string
          id: string
          message_ts: string | null
          payload: Json
          sent_at: string
        }
        Insert: {
          channel: string
          dedupe_key: string
          id?: string
          message_ts?: string | null
          payload: Json
          sent_at?: string
        }
        Update: {
          channel?: string
          dedupe_key?: string
          id?: string
          message_ts?: string | null
          payload?: Json
          sent_at?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_link_source:
        | "klaviyo"
        | "canva"
        | "shopify"
        | "hubspot"
        | "other"
      campaign_status: "planning" | "active" | "complete" | "archived"
      campaign_task_status: "todo" | "in_progress" | "done"
      campaign_type:
        | "dtc_email"
        | "wholesale_push"
        | "launch"
        | "seasonal"
        | "other"
      manufacturing_stage:
        | "ordered"
        | "in_production"
        | "complete"
        | "in_transit"
        | "received"
      po_payment_label: "deposit" | "balance" | "other"
      po_status:
        | "draft"
        | "sent"
        | "confirmed"
        | "in_fulfillment"
        | "shipped"
        | "partially_received"
        | "received"
        | "closed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      campaign_link_source: ["klaviyo", "canva", "shopify", "hubspot", "other"],
      campaign_status: ["planning", "active", "complete", "archived"],
      campaign_task_status: ["todo", "in_progress", "done"],
      campaign_type: [
        "dtc_email",
        "wholesale_push",
        "launch",
        "seasonal",
        "other",
      ],
      manufacturing_stage: [
        "ordered",
        "in_production",
        "complete",
        "in_transit",
        "received",
      ],
      po_payment_label: ["deposit", "balance", "other"],
      po_status: [
        "draft",
        "sent",
        "confirmed",
        "in_fulfillment",
        "shipped",
        "partially_received",
        "received",
        "closed",
        "cancelled",
      ],
    },
  },
} as const
