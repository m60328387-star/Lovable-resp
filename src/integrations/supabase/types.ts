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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      bot_messages: {
        Row: {
          bot_id: string
          chat_id: number
          created_at: string
          id: string
          project_id: string
          raw: Json | null
          role: string
          text: string | null
          update_id: number | null
        }
        Insert: {
          bot_id: string
          chat_id: number
          created_at?: string
          id?: string
          project_id: string
          raw?: Json | null
          role?: string
          text?: string | null
          update_id?: number | null
        }
        Update: {
          bot_id?: string
          chat_id?: number
          created_at?: string
          id?: string
          project_id?: string
          raw?: Json | null
          role?: string
          text?: string | null
          update_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          model: string | null
          persona: string
          platform: string
          project_id: string
          token: string
          updated_at: string
          user_id: string
          username: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          model?: string | null
          persona?: string
          platform?: string
          project_id: string
          token: string
          updated_at?: string
          user_id: string
          username?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          model?: string | null
          persona?: string
          platform?: string
          project_id?: string
          token?: string
          updated_at?: string
          user_id?: string
          username?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          created_at: string
          file_count: number
          files: Json
          id: string
          label: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_count?: number
          files?: Json
          id?: string
          label?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_count?: number
          files?: Json
          id?: string
          label?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_skills: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          icon: string
          id: string
          name: string
          prompt: string
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          icon?: string
          id?: string
          name: string
          prompt?: string
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          icon?: string
          id?: string
          name?: string
          prompt?: string
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      executors: {
        Row: {
          base_url: string
          created_at: string
          id: string
          last_seen_at: string | null
          meta: Json
          name: string
          status: string
          token: string
          updated_at: string
          user_id: string
          workdir: string
        }
        Insert: {
          base_url: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          meta?: Json
          name: string
          status?: string
          token?: string
          updated_at?: string
          user_id: string
          workdir?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          meta?: Json
          name?: string
          status?: string
          token?: string
          updated_at?: string
          user_id?: string
          workdir?: string
        }
        Relationships: []
      }
      file_versions: {
        Row: {
          content: string
          created_at: string
          id: string
          path: string
          project_id: string
          user_id: string
          version: number
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          path: string
          project_id: string
          user_id: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          path?: string
          project_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          content: string
          created_at: string
          id: string
          path: string
          project_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          path: string
          project_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          path?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      message_sync_events: {
        Row: {
          created_at: string
          details: Json
          error_code: string | null
          error_message: string | null
          id: string
          message_count: number
          project_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_count?: number
          project_id: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_count?: number
          project_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_sync_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          position: number
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          position?: number
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          position?: number
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_memory: {
        Row: {
          created_at: string
          id: string
          key: string
          kind: string
          project_id: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          kind?: string
          project_id: string
          updated_at?: string
          user_id: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          kind?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_secrets: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
          user_id: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_secrets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          build_progress: number
          build_state: Json
          created_at: string
          deployed_url: string | null
          id: string
          last_check: Json | null
          last_error: string | null
          next_action: string | null
          published: boolean
          published_at: string | null
          slug: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          build_progress?: number
          build_state?: Json
          created_at?: string
          deployed_url?: string | null
          id?: string
          last_check?: Json | null
          last_error?: string | null
          next_action?: string | null
          published?: boolean
          published_at?: string | null
          slug?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          build_progress?: number
          build_state?: Json
          created_at?: string
          deployed_url?: string | null
          id?: string
          last_check?: Json | null
          last_error?: string | null
          next_action?: string | null
          published?: boolean
          published_at?: string | null
          slug?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      runs: {
        Row: {
          claimed_at: string | null
          created_at: string
          executor_id: string | null
          exit_code: number | null
          finished_at: string | null
          id: string
          input: Json
          kind: string
          output: string | null
          project_id: string
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          executor_id?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind: string
          output?: string | null
          project_id: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          executor_id?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: string
          output?: string | null
          project_id?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_executor_id_fkey"
            columns: ["executor_id"]
            isOneToOne: false
            referencedRelation: "executors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          command: string
          created_at: string
          enabled: boolean
          id: string
          interval_minutes: number
          last_run_at: string | null
          last_run_id: string | null
          last_status: string | null
          name: string
          next_run_at: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          command: string
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_run_at?: string | null
          last_run_id?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          command?: string
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_run_at?: string | null
          last_run_id?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_views: {
        Row: {
          country: string | null
          created_at: string
          id: string
          path: string
          project_id: string
          referrer: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          path?: string
          project_id: string
          referrer?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          path?: string
          project_id?: string
          referrer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      specs: {
        Row: {
          created_at: string
          data: Json
          id: string
          project_id: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          project_id: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          project_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "specs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          acceptance: string | null
          created_at: string
          depends_on: string[]
          id: string
          layer: string
          note: string | null
          position: number
          project_id: string
          status: string
          task_key: string
          title: string
          updated_at: string
          user_id: string
          verification: string[]
        }
        Insert: {
          acceptance?: string | null
          created_at?: string
          depends_on?: string[]
          id?: string
          layer?: string
          note?: string | null
          position?: number
          project_id: string
          status?: string
          task_key: string
          title: string
          updated_at?: string
          user_id: string
          verification?: string[]
        }
        Update: {
          acceptance?: string | null
          created_at?: string
          depends_on?: string[]
          id?: string
          layer?: string
          note?: string | null
          position?: number
          project_id?: string
          status?: string
          task_key?: string
          title?: string
          updated_at?: string
          user_id?: string
          verification?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          project_id: string | null
          total_tokens: number
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          project_id?: string | null
          total_tokens?: number
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          project_id?: string | null
          total_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_project_id_fkey"
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
      append_message_atomic: {
        Args: { p_message: Json; p_project_id: string; p_user_id: string }
        Returns: Json
      }
      save_conversation_atomic: {
        Args: { p_messages: Json; p_project_id: string; p_user_id: string }
        Returns: Json
      }
      weaver_exec_sql: {
        Args: { p_schema: string; p_sql: string }
        Returns: Json
      }
      weaver_query: { Args: { p_schema: string; p_sql: string }; Returns: Json }
      weaver_schema_info: { Args: { p_schema: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
