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
  public: {
    Tables: {
      agent_outputs: {
        Row: {
          agent_type: Database["public"]["Enums"]["agent_kind"]
          company_id: string
          created_at: string
          findings: Json
          id: string
          model: string
          raw: Json | null
          risks: Json
          score: number | null
          summary: string | null
          user_id: string
        }
        Insert: {
          agent_type: Database["public"]["Enums"]["agent_kind"]
          company_id: string
          created_at?: string
          findings?: Json
          id?: string
          model: string
          raw?: Json | null
          risks?: Json
          score?: number | null
          summary?: string | null
          user_id: string
        }
        Update: {
          agent_type?: Database["public"]["Enums"]["agent_kind"]
          company_id?: string
          created_at?: string
          findings?: Json
          id?: string
          model?: string
          raw?: Json | null
          risks?: Json
          score?: number | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_outputs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          business_model: string | null
          created_at: string
          current_price: number | null
          description: string | null
          exchange: Database["public"]["Enums"]["exchange_kind"]
          id: string
          industry: string | null
          market_cap_crore: number | null
          name: string
          sector: string | null
          shares_outstanding: number | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_model?: string | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          exchange?: Database["public"]["Enums"]["exchange_kind"]
          id?: string
          industry?: string | null
          market_cap_crore?: number | null
          name: string
          sector?: string | null
          shares_outstanding?: number | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_model?: string | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          exchange?: Database["public"]["Enums"]["exchange_kind"]
          id?: string
          industry?: string | null
          market_cap_crore?: number | null
          name?: string
          sector?: string | null
          shares_outstanding?: number | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dcf_models: {
        Row: {
          assumptions: Json
          base_value: number | null
          bear_value: number | null
          bull_value: number | null
          company_id: string
          created_at: string
          enterprise_value: number | null
          equity_value: number | null
          id: string
          intrinsic_value_per_share: number | null
          projections: Json
          scenario: string
          sensitivity: Json | null
          terminal_growth: number | null
          updated_at: string
          user_id: string
          wacc: number | null
        }
        Insert: {
          assumptions?: Json
          base_value?: number | null
          bear_value?: number | null
          bull_value?: number | null
          company_id: string
          created_at?: string
          enterprise_value?: number | null
          equity_value?: number | null
          id?: string
          intrinsic_value_per_share?: number | null
          projections?: Json
          scenario?: string
          sensitivity?: Json | null
          terminal_growth?: number | null
          updated_at?: string
          user_id: string
          wacc?: number | null
        }
        Update: {
          assumptions?: Json
          base_value?: number | null
          bear_value?: number | null
          bull_value?: number | null
          company_id?: string
          created_at?: string
          enterprise_value?: number | null
          equity_value?: number | null
          id?: string
          intrinsic_value_per_share?: number | null
          projections?: Json
          scenario?: string
          sensitivity?: Json | null
          terminal_growth?: number | null
          updated_at?: string
          user_id?: string
          wacc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dcf_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string
          created_at: string
          extracted_text: string | null
          file_path: string | null
          fiscal_year: number | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          metadata: Json
          mime_type: string | null
          page_count: number | null
          period: string | null
          title: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          extracted_text?: string | null
          file_path?: string | null
          fiscal_year?: number | null
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          metadata?: Json
          mime_type?: string | null
          page_count?: number | null
          period?: string | null
          title: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          extracted_text?: string | null
          file_path?: string | null
          fiscal_year?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          metadata?: Json
          mime_type?: string | null
          page_count?: number | null
          period?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_statements: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          data: Json
          fiscal_year: number
          id: string
          period_end: string
          period_type: Database["public"]["Enums"]["period_kind"]
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          data?: Json
          fiscal_year: number
          id?: string
          period_end: string
          period_type: Database["public"]["Enums"]["period_kind"]
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          data?: Json
          fiscal_year?: number
          id?: string
          period_end?: string
          period_type?: Database["public"]["Enums"]["period_kind"]
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      peers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          peer_company_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          peer_company_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          peer_company_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peers_peer_company_id_fkey"
            columns: ["peer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ratios: {
        Row: {
          company_id: string
          created_at: string
          id: string
          metrics: Json
          period_end: string
          scores: Json
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          metrics?: Json
          period_end: string
          scores?: Json
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          metrics?: Json
          period_end?: string
          scores?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          base_case: string | null
          bear_case: string | null
          bull_case: string | null
          company_id: string
          created_at: string
          id: string
          recommendation:
            | Database["public"]["Enums"]["recommendation_kind"]
            | null
          scores: Json
          sections: Json
          status: Database["public"]["Enums"]["report_status"]
          target_price: number | null
          thesis: string | null
          updated_at: string
          upside_pct: number | null
          user_id: string
        }
        Insert: {
          base_case?: string | null
          bear_case?: string | null
          bull_case?: string | null
          company_id: string
          created_at?: string
          id?: string
          recommendation?:
            | Database["public"]["Enums"]["recommendation_kind"]
            | null
          scores?: Json
          sections?: Json
          status?: Database["public"]["Enums"]["report_status"]
          target_price?: number | null
          thesis?: string | null
          updated_at?: string
          upside_pct?: number | null
          user_id: string
        }
        Update: {
          base_case?: string | null
          bear_case?: string | null
          bull_case?: string | null
          company_id?: string
          created_at?: string
          id?: string
          recommendation?:
            | Database["public"]["Enums"]["recommendation_kind"]
            | null
          scores?: Json
          sections?: Json
          status?: Database["public"]["Enums"]["report_status"]
          target_price?: number | null
          thesis?: string | null
          updated_at?: string
          upside_pct?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          company_id: string
          conviction: Database["public"]["Enums"]["conviction_kind"]
          created_at: string
          id: string
          notes: string | null
          target_price: number | null
          thesis: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          conviction?: Database["public"]["Enums"]["conviction_kind"]
          created_at?: string
          id?: string
          notes?: string | null
          target_price?: number | null
          thesis?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          conviction?: Database["public"]["Enums"]["conviction_kind"]
          created_at?: string
          id?: string
          notes?: string | null
          target_price?: number | null
          thesis?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      agent_kind:
        | "business"
        | "financial"
        | "management"
        | "industry"
        | "risk"
        | "valuation"
      app_role: "admin" | "user"
      conviction_kind: "high" | "medium" | "low" | "watch" | "avoid"
      document_kind:
        | "annual_report"
        | "concall"
        | "presentation"
        | "quarterly_result"
        | "credit_rating"
        | "other"
      exchange_kind: "NSE" | "BSE" | "OTHER"
      period_kind: "annual" | "quarterly" | "ttm"
      recommendation_kind: "strong_buy" | "buy" | "hold" | "reduce" | "sell"
      report_status: "draft" | "generating" | "ready" | "error"
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
  public: {
    Enums: {
      agent_kind: [
        "business",
        "financial",
        "management",
        "industry",
        "risk",
        "valuation",
      ],
      app_role: ["admin", "user"],
      conviction_kind: ["high", "medium", "low", "watch", "avoid"],
      document_kind: [
        "annual_report",
        "concall",
        "presentation",
        "quarterly_result",
        "credit_rating",
        "other",
      ],
      exchange_kind: ["NSE", "BSE", "OTHER"],
      period_kind: ["annual", "quarterly", "ttm"],
      recommendation_kind: ["strong_buy", "buy", "hold", "reduce", "sell"],
      report_status: ["draft", "generating", "ready", "error"],
    },
  },
} as const
