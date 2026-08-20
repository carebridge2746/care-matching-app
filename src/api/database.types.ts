import type { UserRole } from '@/types';

/**
 * Supabase 테이블 타입.
 *
 * 지금은 인증에 필요한 profiles 만 정의한다. 테이블이 늘어나면 여기에 추가하거나
 * `npx supabase gen types typescript` 결과로 교체한다.
 * 실제 스키마는 supabase/schema.sql 에 있으며 두 곳을 함께 수정해야 한다.
 */

export type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
