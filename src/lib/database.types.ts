export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      court: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          season_id: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          season_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          season_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'court_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'season';
            referencedColumns: ['id'];
          },
        ];
      };
      person: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string;
          gender: Database['public']['Enums']['gender'];
          id: string;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name: string;
          gender: Database['public']['Enums']['gender'];
          id?: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string;
          gender?: Database['public']['Enums']['gender'];
          id?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile: {
        Row: {
          created_at: string;
          display_name: string;
          is_active: boolean;
          must_change_password: boolean;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name: string;
          is_active?: boolean;
          must_change_password?: boolean;
          role: Database['public']['Enums']['user_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          is_active?: boolean;
          must_change_password?: boolean;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      season: {
        Row: {
          created_at: string;
          id: string;
          is_current: boolean;
          match_days: string[];
          name: string;
          settings: NonNullable<Json>;
          status: Database['public']['Enums']['season_status'];
          updated_at: string;
          venue: string;
          year: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          match_days?: string[];
          name: string;
          settings?: NonNullable<Json>;
          status?: Database['public']['Enums']['season_status'];
          updated_at?: string;
          venue?: string;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          match_days?: string[];
          name?: string;
          settings?: NonNullable<Json>;
          status?: Database['public']['Enums']['season_status'];
          updated_at?: string;
          venue?: string;
          year?: number;
        };
        Relationships: [];
      };
      season_player: {
        Row: {
          created_at: string;
          id: string;
          person_id: string;
          rank: number;
          season_id: string;
          skill_points: number;
          status: Database['public']['Enums']['season_player_status'];
          team_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          person_id: string;
          rank: number;
          season_id: string;
          skill_points: number;
          status?: Database['public']['Enums']['season_player_status'];
          team_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          person_id?: string;
          rank?: number;
          season_id?: string;
          skill_points?: number;
          status?: Database['public']['Enums']['season_player_status'];
          team_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'season_player_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'person';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'season_player_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'season';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'season_player_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
        ];
      };
      season_player_private: {
        Row: {
          created_at: string;
          fee_amount: number;
          fee_paid_at: string | null;
          id: string;
          member_type: Database['public']['Enums']['member_type'];
          note: string;
          season_player_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          fee_amount: number;
          fee_paid_at?: string | null;
          id?: string;
          member_type: Database['public']['Enums']['member_type'];
          note?: string;
          season_player_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          fee_amount?: number;
          fee_paid_at?: string | null;
          id?: string;
          member_type?: Database['public']['Enums']['member_type'];
          note?: string;
          season_player_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'season_player_private_season_player_id_fkey';
            columns: ['season_player_id'];
            isOneToOne: true;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
        ];
      };
      team: {
        Row: {
          captain_id: string | null;
          color: string;
          created_at: string;
          disqualified_at: string | null;
          disqualified_reason: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          season_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          captain_id?: string | null;
          color: string;
          created_at?: string;
          disqualified_at?: string | null;
          disqualified_reason?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          season_id: string;
          updated_at?: string;
        };
        Update: {
          captain_id?: string | null;
          color?: string;
          created_at?: string;
          disqualified_at?: string | null;
          disqualified_reason?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          season_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_captain_id_fkey';
            columns: ['captain_id'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'season';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      gender: 'male' | 'female';
      member_type: 'employee' | 'intern' | 'guest';
      season_player_status: 'active' | 'withdrawn';
      season_status: 'draft' | 'published' | 'group' | 'knockout' | 'finished';
      user_role: 'btc' | 'referee';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      gender: ['male', 'female'],
      member_type: ['employee', 'intern', 'guest'],
      season_player_status: ['active', 'withdrawn'],
      season_status: ['draft', 'published', 'group', 'knockout', 'finished'],
      user_role: ['btc', 'referee'],
    },
  },
} as const;
