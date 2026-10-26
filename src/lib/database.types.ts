export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: Database['public']['Enums']['audit_action'];
          actor_id: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          entity: string;
          entity_id: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          action: Database['public']['Enums']['audit_action'];
          actor_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          entity: string;
          entity_id: string;
          id?: string;
        };
        Update: {
          action?: Database['public']['Enums']['audit_action'];
          actor_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          entity?: string;
          entity_id?: string;
          id?: string;
        };
        Relationships: [];
      };
      award: {
        Row: {
          created_at: string;
          criteria_en: string | null;
          criteria_vi: string;
          id: string;
          name_en: string | null;
          name_vi: string;
          note: string | null;
          season_id: string;
          sort_order: number;
          sponsor: string | null;
          updated_at: string;
          value_vnd: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          criteria_en?: string | null;
          criteria_vi?: string;
          id?: string;
          name_en?: string | null;
          name_vi: string;
          note?: string | null;
          season_id: string;
          sort_order?: number;
          sponsor?: string | null;
          updated_at?: string;
          value_vnd?: number | null;
        };
        Update: {
          created_at?: string;
          criteria_en?: string | null;
          criteria_vi?: string;
          id?: string;
          name_en?: string | null;
          name_vi?: string;
          note?: string | null;
          season_id?: string;
          sort_order?: number;
          sponsor?: string | null;
          updated_at?: string;
          value_vnd?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'award_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'season';
            referencedColumns: ['id'];
          },
        ];
      };
      award_winner: {
        Row: {
          award_id: string;
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['award_winner_kind'];
          match_id: string | null;
          note: string | null;
          team_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          award_id: string;
          created_at?: string;
          id?: string;
          kind: Database['public']['Enums']['award_winner_kind'];
          match_id?: string | null;
          note?: string | null;
          team_id?: string | null;
          updated_at?: string;
        };
        Update: {
          award_id?: string;
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['award_winner_kind'];
          match_id?: string | null;
          note?: string | null;
          team_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'award_winner_award_id_fkey';
            columns: ['award_id'];
            isOneToOne: false;
            referencedRelation: 'award';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'award_winner_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'match';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'award_winner_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
        ];
      };
      award_winner_member: {
        Row: {
          award_winner_id: string;
          created_at: string;
          id: string;
          season_player_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          award_winner_id: string;
          created_at?: string;
          id?: string;
          season_player_id: string;
          updated_at?: string;
        };
        Update: {
          award_winner_id?: string;
          created_at?: string;
          id?: string;
          season_player_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'award_winner_member_award_winner_id_fkey';
            columns: ['award_winner_id'];
            isOneToOne: false;
            referencedRelation: 'award_winner';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'award_winner_member_season_player_id_fkey';
            columns: ['season_player_id'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
        ];
      };
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
      group_closure: {
        Row: {
          closed_at: string;
          closed_by: string | null;
          created_at: string;
          final_order: string[];
          id: string;
          manual_draws: NonNullable<Json>;
          season_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          closed_at?: string;
          closed_by?: string | null;
          created_at?: string;
          final_order: string[];
          id?: string;
          manual_draws?: NonNullable<Json>;
          season_id: string;
          updated_at?: string;
        };
        Update: {
          closed_at?: string;
          closed_by?: string | null;
          created_at?: string;
          final_order?: string[];
          id?: string;
          manual_draws?: NonNullable<Json>;
          season_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_closure_closed_by_fkey';
            columns: ['closed_by'];
            isOneToOne: false;
            referencedRelation: 'profile';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'group_closure_closed_by_fkey';
            columns: ['closed_by'];
            isOneToOne: false;
            referencedRelation: 'referee_name';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'group_closure_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: true;
            referencedRelation: 'season';
            referencedColumns: ['id'];
          },
        ];
      };
      lineup_override: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          match_id: string;
          reason: string;
          rule_code: Database['public']['Enums']['lineup_rule_code'];
          team_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          match_id: string;
          reason: string;
          rule_code: Database['public']['Enums']['lineup_rule_code'];
          team_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          match_id?: string;
          reason?: string;
          rule_code?: Database['public']['Enums']['lineup_rule_code'];
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lineup_override_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profile';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'lineup_override_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'referee_name';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'lineup_override_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'match';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lineup_override_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
        ];
      };
      match: {
        Row: {
          away_team_id: string | null;
          code: string;
          court_id: string | null;
          created_at: string;
          forfeit_reason: string | null;
          forfeit_team_id: string | null;
          home_team_id: string | null;
          id: string;
          imported: boolean;
          referee_id: string | null;
          relay_handicap_away: number | null;
          relay_handicap_home: number | null;
          round: number | null;
          scheduled_at: string | null;
          season_id: string;
          stage: Database['public']['Enums']['match_stage'];
          status: Database['public']['Enums']['match_status'];
          status_before_annul: Database['public']['Enums']['match_status'] | null;
          updated_at: string;
          winner_team_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          away_team_id?: string | null;
          code: string;
          court_id?: string | null;
          created_at?: string;
          forfeit_reason?: string | null;
          forfeit_team_id?: string | null;
          home_team_id?: string | null;
          id?: string;
          imported?: boolean;
          referee_id?: string | null;
          relay_handicap_away?: number | null;
          relay_handicap_home?: number | null;
          round?: number | null;
          scheduled_at?: string | null;
          season_id: string;
          stage: Database['public']['Enums']['match_stage'];
          status?: Database['public']['Enums']['match_status'];
          status_before_annul?: Database['public']['Enums']['match_status'] | null;
          updated_at?: string;
          winner_team_id?: string | null;
        };
        Update: {
          away_team_id?: string | null;
          code?: string;
          court_id?: string | null;
          created_at?: string;
          forfeit_reason?: string | null;
          forfeit_team_id?: string | null;
          home_team_id?: string | null;
          id?: string;
          imported?: boolean;
          referee_id?: string | null;
          relay_handicap_away?: number | null;
          relay_handicap_home?: number | null;
          round?: number | null;
          scheduled_at?: string | null;
          season_id?: string;
          stage?: Database['public']['Enums']['match_stage'];
          status?: Database['public']['Enums']['match_status'];
          status_before_annul?: Database['public']['Enums']['match_status'] | null;
          updated_at?: string;
          winner_team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'match_away_team_id_fkey';
            columns: ['away_team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_court_id_fkey';
            columns: ['court_id'];
            isOneToOne: false;
            referencedRelation: 'court';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_forfeit_team_id_fkey';
            columns: ['forfeit_team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_home_team_id_fkey';
            columns: ['home_team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_referee_id_fkey';
            columns: ['referee_id'];
            isOneToOne: false;
            referencedRelation: 'profile';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'match_referee_id_fkey';
            columns: ['referee_id'];
            isOneToOne: false;
            referencedRelation: 'referee_name';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'match_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'season';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_winner_team_id_fkey';
            columns: ['winner_team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
        ];
      };
      match_attendance: {
        Row: {
          created_at: string;
          id: string;
          match_id: string;
          season_player_id: string;
          team_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          match_id: string;
          season_player_id: string;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          match_id?: string;
          season_player_id?: string;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_attendance_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'match';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_attendance_season_player_id_fkey';
            columns: ['season_player_id'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_attendance_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
        ];
      };
      match_slot: {
        Row: {
          away_p1: string | null;
          away_p2: string | null;
          created_at: string;
          handicap_away: number;
          handicap_home: number;
          home_p1: string | null;
          home_p2: string | null;
          id: string;
          match_id: string;
          score_away: number | null;
          score_home: number | null;
          slot_no: number;
          slot_type: Database['public']['Enums']['slot_type'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          away_p1?: string | null;
          away_p2?: string | null;
          created_at?: string;
          handicap_away?: number;
          handicap_home?: number;
          home_p1?: string | null;
          home_p2?: string | null;
          id?: string;
          match_id: string;
          score_away?: number | null;
          score_home?: number | null;
          slot_no: number;
          slot_type: Database['public']['Enums']['slot_type'];
          updated_at?: string;
        };
        Update: {
          away_p1?: string | null;
          away_p2?: string | null;
          created_at?: string;
          handicap_away?: number;
          handicap_home?: number;
          home_p1?: string | null;
          home_p2?: string | null;
          id?: string;
          match_id?: string;
          score_away?: number | null;
          score_home?: number | null;
          slot_no?: number;
          slot_type?: Database['public']['Enums']['slot_type'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_slot_away_p1_fkey';
            columns: ['away_p1'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_slot_away_p2_fkey';
            columns: ['away_p2'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_slot_home_p1_fkey';
            columns: ['home_p1'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_slot_home_p2_fkey';
            columns: ['home_p2'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_slot_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'match';
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
      slot_substitution: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          match_slot_id: string;
          reason: string;
          replaced_id: string;
          side: Database['public']['Enums']['match_side'];
          substitute_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          match_slot_id: string;
          reason?: string;
          replaced_id: string;
          side: Database['public']['Enums']['match_side'];
          substitute_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          match_slot_id?: string;
          reason?: string;
          replaced_id?: string;
          side?: Database['public']['Enums']['match_side'];
          substitute_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'slot_substitution_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profile';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'slot_substitution_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'referee_name';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'slot_substitution_match_slot_id_fkey';
            columns: ['match_slot_id'];
            isOneToOne: false;
            referencedRelation: 'match_slot';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'slot_substitution_replaced_id_fkey';
            columns: ['replaced_id'];
            isOneToOne: false;
            referencedRelation: 'season_player';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'slot_substitution_substitute_id_fkey';
            columns: ['substitute_id'];
            isOneToOne: false;
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
      referee_name: {
        Row: {
          display_name: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          display_name?: string | null;
          user_id?: string | null;
        };
        Update: {
          display_name?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      audit_action: 'insert' | 'update' | 'delete';
      award_winner_kind: 'player' | 'pair' | 'team';
      gender: 'male' | 'female';
      lineup_rule_code:
        | 'SLOT_INCOMPLETE'
        | 'NOT_PRESENT'
        | 'MIN_SETS'
        | 'MAX_SETS'
        | 'CONSECUTIVE'
        | 'LOW_RANK_SLOT'
        | 'HIGH_RANK_SLOT'
        | 'COMPENSATION'
        | 'MIN_PRESENT'
        | 'SUB_RANK';
      match_side: 'home' | 'away';
      match_stage: 'group' | 'semi_final' | 'third_place' | 'final';
      match_status: 'scheduled' | 'lineup_locked' | 'in_progress' | 'completed' | 'forfeit' | 'annulled';
      member_type: 'employee' | 'intern' | 'guest';
      season_player_status: 'active' | 'withdrawn';
      season_status: 'draft' | 'published' | 'group' | 'knockout' | 'finished';
      slot_type: 'open' | 'low' | 'high';
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
      audit_action: ['insert', 'update', 'delete'],
      award_winner_kind: ['player', 'pair', 'team'],
      gender: ['male', 'female'],
      lineup_rule_code: [
        'SLOT_INCOMPLETE',
        'NOT_PRESENT',
        'MIN_SETS',
        'MAX_SETS',
        'CONSECUTIVE',
        'LOW_RANK_SLOT',
        'HIGH_RANK_SLOT',
        'COMPENSATION',
        'MIN_PRESENT',
        'SUB_RANK',
      ],
      match_side: ['home', 'away'],
      match_stage: ['group', 'semi_final', 'third_place', 'final'],
      match_status: ['scheduled', 'lineup_locked', 'in_progress', 'completed', 'forfeit', 'annulled'],
      member_type: ['employee', 'intern', 'guest'],
      season_player_status: ['active', 'withdrawn'],
      season_status: ['draft', 'published', 'group', 'knockout', 'finished'],
      slot_type: ['open', 'low', 'high'],
      user_role: ['btc', 'referee'],
    },
  },
} as const;
