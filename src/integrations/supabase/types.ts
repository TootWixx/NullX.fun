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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      auth_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          hwid: string | null
          id: string
          ip_address: string | null
          key_id: string | null
          project_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          hwid?: string | null
          id?: string
          ip_address?: string | null
          key_id?: string | null
          project_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          hwid?: string | null
          id?: string
          ip_address?: string | null
          key_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_logs_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "license_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_completions: {
        Row: {
          checkpoint_id: string
          completed_at: string
          hwid: string | null
          id: string
          ip_address: string | null
          session_token: string
        }
        Insert: {
          checkpoint_id: string
          completed_at?: string
          hwid?: string | null
          id?: string
          ip_address?: string | null
          session_token: string
        }
        Update: {
          checkpoint_id?: string
          completed_at?: string
          hwid?: string | null
          id?: string
          ip_address?: string | null
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_completions_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoint_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_configs: {
        Row: {
          checkpoint_type: string
          display_label: string | null
          guild_id: string | null
          checkpoint_name: string
          checkpoint_order: number
          created_at: string
          id: string
          is_active: boolean
          project_id: string
          provider: string
          provider_link: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checkpoint_type?: string
          display_label?: string | null
          guild_id?: string | null
          checkpoint_name: string
          checkpoint_order?: number
          created_at?: string
          id?: string
          is_active?: boolean
          project_id: string
          provider: string
          provider_link: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          checkpoint_type?: string
          display_label?: string | null
          guild_id?: string | null
          checkpoint_name?: string
          checkpoint_order?: number
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string
          provider?: string
          provider_link?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          id: string
          user_id: string
          username: string | null
          avatar_url: string | null
          background_url: string | null
          background_color: string
          bio: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          username?: string | null
          avatar_url?: string | null
          background_url?: string | null
          background_color?: string
          bio?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          username?: string | null
          avatar_url?: string | null
          background_url?: string | null
          background_color?: string
          bio?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_provider_credentials: {
        Row: {
          api_token_encrypted: string
          created_at: string
          encryption_iv: string
          encryption_salt: string
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_token_encrypted: string
          created_at?: string
          encryption_iv: string
          encryption_salt: string
          id?: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_token_encrypted?: string
          created_at?: string
          encryption_iv?: string
          encryption_salt?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checkpoint_sessions: {
        Row: {
          completed_all: boolean
          created_at: string
          expires_at: string
          hwid: string | null
          id: string
          ip_address: string | null
          issued_key: string | null
          project_id: string
          session_token: string
        }
        Insert: {
          completed_all?: boolean
          created_at?: string
          expires_at?: string
          hwid?: string | null
          id?: string
          ip_address?: string | null
          issued_key?: string | null
          project_id: string
          session_token: string
        }
        Update: {
          completed_all?: boolean
          created_at?: string
          expires_at?: string
          hwid?: string | null
          id?: string
          ip_address?: string | null
          issued_key?: string | null
          project_id?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_configs: {
        Row: {
          created_at: string
          id: string
          salt: string
          user_id: string
          verification_blob: string
        }
        Insert: {
          created_at?: string
          id?: string
          salt: string
          user_id: string
          verification_blob: string
        }
        Update: {
          created_at?: string
          id?: string
          salt?: string
          user_id?: string
          verification_blob?: string
        }
        Relationships: []
      }
      license_keys: {
        Row: {
          created_at: string
          current_uses: number
          expires_at: string | null
          hwid: string | null
          id: string
          is_active: boolean
          key_value: string
          max_uses: number | null
          note: string | null
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_uses?: number
          expires_at?: string | null
          hwid?: string | null
          id?: string
          is_active?: boolean
          key_value: string
          max_uses?: number | null
          note?: string | null
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_uses?: number
          expires_at?: string | null
          hwid?: string | null
          id?: string
          is_active?: boolean
          key_value?: string
          max_uses?: number | null
          note?: string | null
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_keys_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      obfuscated_scripts: {
        Row: {
          created_at: string
          id: string
          obfuscated_content: string
          original_name: string | null
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          obfuscated_content: string
          original_name?: string | null
          project_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          obfuscated_content?: string
          original_name?: string | null
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obfuscated_scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          encryption_iv: string | null
          encryption_salt: string | null
          id: string
          is_active: boolean
          name: string
          panel_key: string
          script_content: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          encryption_iv?: string | null
          encryption_salt?: string | null
          id?: string
          is_active?: boolean
          name: string
          panel_key?: string
          script_content?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          encryption_iv?: string | null
          encryption_salt?: string | null
          id?: string
          is_active?: boolean
          name?: string
          panel_key?: string
          script_content?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_panel_keys: {
        Row: {
          created_at: string
          id: string
          is_visible: boolean
          panel_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_visible?: boolean
          panel_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_visible?: boolean
          panel_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      discord_bot_operators: {
        Row: {
          created_at: string
          discord_user_id: string
          label: string | null
        }
        Insert: {
          created_at?: string
          discord_user_id: string
          label?: string | null
        }
        Update: {
          created_at?: string
          discord_user_id?: string
          label?: string | null
        }
        Relationships: []
      }
      discord_connections: {
        Row: {
          discord_user_id: string
          discord_username: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          discord_user_id: string
          discord_username?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          discord_user_id?: string
          discord_username?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      webhook_configs: {
        Row: {
          created_at: string
          discord_webhook_url: string
          id: string
          is_active: boolean
          log_hwid: boolean
          log_hwid_change: boolean
          log_ip: boolean
          log_isp: boolean
          log_key_auth: boolean
          log_key_reset: boolean
          log_location: boolean
          log_os: boolean
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discord_webhook_url: string
          id?: string
          is_active?: boolean
          log_hwid?: boolean
          log_hwid_change?: boolean
          log_ip?: boolean
          log_isp?: boolean
          log_key_auth?: boolean
          log_key_reset?: boolean
          log_location?: boolean
          log_os?: boolean
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discord_webhook_url?: string
          id?: string
          is_active?: boolean
          log_hwid?: boolean
          log_hwid_change?: boolean
          log_ip?: boolean
          log_isp?: boolean
          log_key_auth?: boolean
          log_key_reset?: boolean
          log_location?: boolean
          log_os?: boolean
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_panel_key: { Args: never; Returns: string }
      generate_user_panel_key: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
