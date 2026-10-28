// Kiểu dữ liệu khớp với backend/supabase/schema.sql.
// Khi đã link project, có thể sinh lại bằng:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type TaskType = 'assignment' | 'lab' | 'practical' | 'revision' | 'group_project'
type PriorityLevel = 'low' | 'medium' | 'high'
type TaskStatus = 'todo' | 'in_progress' | 'done'
type ExamType = 'PE' | 'FE'
type BlockName = 'Block 1' | 'Block 2' | 'Block 3'
type CourseColor = 'red' | 'blue' | 'purple' | 'orange' | 'green' | 'teal' | 'pink' | 'amber'
type GroupRole = 'owner' | 'member'

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          student_code: string | null
          campus: string
          avatar_url: string | null
          role: 'user' | 'admin'
          is_locked: boolean
          locked_at: string | null
          locked_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: {
          full_name?: string
          student_code?: string | null
          campus?: string
          avatar_url?: string | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          id: string
          user_id: string
          code: string
          name: string
          color_code: CourseColor
          color_hex?: string | null
          lecturer?: string | null
          block_name: BlockName
          semester: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          code: string
          name: string
          color_code?: CourseColor
          color_hex?: string | null
          lecturer?: string | null
          block_name?: BlockName
          semester?: string | null
        }
        Update: {
          code?: string
          name?: string
          color_code?: CourseColor
          color_hex?: string | null
          lecturer?: string | null
          block_name?: BlockName
          semester?: string | null
        }
        Relationships: []
      }
      schedules: {
        Row: {
          id: string
          user_id: string
          course_id: string
          day_of_week: number
          room: string | null
          lecturer: string | null
          start_time: string
          end_time: string
          block_period: BlockName
          end_date: string | null
          start_date: string | null
          skip_dates: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          course_id: string
          day_of_week: number
          room?: string | null
          lecturer?: string | null
          start_time: string
          end_time: string
          block_period?: BlockName
          end_date?: string | null
          start_date?: string | null
          skip_dates?: string[]
        }
        Update: {
          course_id?: string
          day_of_week?: number
          room?: string | null
          lecturer?: string | null
          start_time?: string
          end_time?: string
          block_period?: BlockName
          end_date?: string | null
          start_date?: string | null
          skip_dates?: string[]
        }
        Relationships: [
          { foreignKeyName: 'schedules_course_id_user_id_fkey'; columns: ['course_id', 'user_id']; isOneToOne: false; referencedRelation: 'courses'; referencedColumns: ['id', 'user_id'] },
        ]
      }
      exams: {
        Row: {
          id: string
          user_id: string
          course_id: string
          exam_type: ExamType
          exam_date: string
          duration_minutes: number | null
          room: string | null
          exam_format: string | null
          weight_percentage: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          course_id: string
          exam_type: ExamType
          exam_date: string
          duration_minutes?: number | null
          room?: string | null
          exam_format?: string | null
          weight_percentage?: number | null
          notes?: string | null
        }
        Update: {
          course_id?: string
          exam_type?: ExamType
          exam_date?: string
          duration_minutes?: number | null
          room?: string | null
          exam_format?: string | null
          weight_percentage?: number | null
          notes?: string | null
        }
        Relationships: [
          { foreignKeyName: 'exams_course_id_user_id_fkey'; columns: ['course_id', 'user_id']; isOneToOne: false; referencedRelation: 'courses'; referencedColumns: ['id', 'user_id'] },
        ]
      }
      groups: {
        Row: {
          id: string
          name: string
          description: string | null
          course_id: string | null
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: { id?: string; name: string; description?: string | null; course_id?: string | null; owner_id?: string }
        Update: { name?: string; description?: string | null; course_id?: string | null }
        Relationships: [
          { foreignKeyName: 'groups_course_id_fkey'; columns: ['course_id']; isOneToOne: false; referencedRelation: 'courses'; referencedColumns: ['id'] },
        ]
      }
      group_members: {
        Row: { group_id: string; user_id: string; role: GroupRole; joined_at: string }
        Insert: { group_id: string; user_id: string; role?: GroupRole }
        Update: never
        Relationships: [
          { foreignKeyName: 'group_members_group_id_fkey'; columns: ['group_id']; isOneToOne: false; referencedRelation: 'groups'; referencedColumns: ['id'] },
          { foreignKeyName: 'group_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
        ]
      }
      group_invitations: {
        Row: {
          id: string
          group_id: string
          invitee_id: string
          inviter_id: string
          status: 'pending' | 'declined'
          created_at: string
          responded_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      deadlines: {
        Row: {
          id: string
          user_id: string
          course_id: string | null
          group_id: string | null
          title: string
          task_type: TaskType
          due_date: string
          priority: PriorityLevel
          status: TaskStatus
          progress_percent: number
          notes: string | null
          is_group: boolean
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          course_id?: string | null
          group_id?: string | null
          title: string
          task_type?: TaskType
          due_date: string
          priority?: PriorityLevel
          status?: TaskStatus
          progress_percent?: number
          notes?: string | null
        }
        Update: {
          course_id?: string | null
          title?: string
          task_type?: TaskType
          due_date?: string
          priority?: PriorityLevel
          status?: TaskStatus
          progress_percent?: number
          notes?: string | null
        }
        Relationships: [
          { foreignKeyName: 'deadlines_course_id_fkey'; columns: ['course_id']; isOneToOne: false; referencedRelation: 'courses'; referencedColumns: ['id'] },
          { foreignKeyName: 'deadlines_group_id_fkey'; columns: ['group_id']; isOneToOne: false; referencedRelation: 'groups'; referencedColumns: ['id'] },
        ]
      }
      subtasks: {
        Row: { id: string; deadline_id: string; title: string; is_completed: boolean; position: number; created_at: string }
        Insert: { id?: string; deadline_id: string; title: string; is_completed?: boolean; position?: number }
        Update: { title?: string; is_completed?: boolean; position?: number }
        Relationships: [
          { foreignKeyName: 'subtasks_deadline_id_fkey'; columns: ['deadline_id']; isOneToOne: false; referencedRelation: 'deadlines'; referencedColumns: ['id'] },
        ]
      }
      assignments: {
        Row: {
          id: string
          group_id: string
          deadline_id: string
          assignee_id: string | null
          title: string
          status: TaskStatus
          due_date: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_id: string
          deadline_id: string
          assignee_id?: string | null
          title: string
          status?: TaskStatus
          due_date?: string | null
          created_by?: string
        }
        Update: { assignee_id?: string | null; title?: string; status?: TaskStatus; due_date?: string | null }
        Relationships: [
          { foreignKeyName: 'assignments_deadline_id_fkey'; columns: ['deadline_id']; isOneToOne: false; referencedRelation: 'deadlines'; referencedColumns: ['id'] },
          { foreignKeyName: 'assignments_group_id_fkey'; columns: ['group_id']; isOneToOne: false; referencedRelation: 'groups'; referencedColumns: ['id'] },
        ]
      }
      share_links: {
        Row: {
          id: string
          code: string
          deadline_id: string
          created_by: string
          include_notes: boolean
          expires_at: string | null
          max_uses: number | null
          use_count: number
          created_at: string
        }
        Insert: { deadline_id: string; include_notes?: boolean; expires_at?: string | null; max_uses?: number | null }
        Update: never
        Relationships: [
          { foreignKeyName: 'share_links_deadline_id_fkey'; columns: ['deadline_id']; isOneToOne: false; referencedRelation: 'deadlines'; referencedColumns: ['id'] },
        ]
      }
      study_sessions: {
        Row: {
          id: string
          user_id: string
          course_id: string | null
          deadline_id: string | null
          exam_id: string | null
          title: string
          start_at: string
          end_at: string
          is_done: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id?: string | null
          deadline_id?: string | null
          exam_id?: string | null
          title: string
          start_at: string
          end_at: string
          is_done?: boolean
          notes?: string | null
        }
        Update: {
          course_id?: string | null
          deadline_id?: string | null
          exam_id?: string | null
          title?: string
          start_at?: string
          end_at?: string
          is_done?: boolean
          notes?: string | null
        }
        Relationships: [
          { foreignKeyName: 'study_sessions_course_id_fkey'; columns: ['course_id']; isOneToOne: false; referencedRelation: 'courses'; referencedColumns: ['id'] },
          { foreignKeyName: 'study_sessions_deadline_id_fkey'; columns: ['deadline_id']; isOneToOne: false; referencedRelation: 'deadlines'; referencedColumns: ['id'] },
          { foreignKeyName: 'study_sessions_exam_id_fkey'; columns: ['exam_id']; isOneToOne: false; referencedRelation: 'exams'; referencedColumns: ['id'] },
        ]
      }
      push_subscriptions: {
        Row: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: string; last_used_at: string | null }
        Insert: { endpoint: string; p256dh: string; auth: string; user_agent?: string | null }
        Update: never
        Relationships: []
      }
      /** Mốc nhắc deadline người dùng chọn (migration 020) */
      reminder_prefs: {
        Row: { user_id: string; kinds: string[]; updated_at: string }
        Insert: { user_id: string; kinds: string[]; updated_at?: string }
        Update: { kinds?: string[]; updated_at?: string }
        Relationships: []
      }
      /** Email tổng hợp mỗi sáng (migration 008). Chỉ đọc được user_id / enabled / updated_at; ghi qua set_email_digest() */
      email_prefs: {
        Row: { user_id: string; enabled: boolean; updated_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_shared_deadline: { Args: { p_code: string }; Returns: Json }
      /** Lý do khóa tài khoản của chính mình (cột locked_reason không đọc trực tiếp được) */
      my_lock_info: { Args: Record<string, never>; Returns: Json }
      copy_shared_deadline_limited: { Args: { p_code: string }; Returns: string }
      add_group_member_limited: { Args: { p_group_id: string; p_email: string }; Returns: Json }
      search_invitable_users_limited: {
        Args: { p_group_id: string; p_query: string }
        Returns: { user_id: string; full_name: string; avatar_url: string | null; email_hint: string; invited: boolean }[]
      }
      invite_to_group_limited: { Args: { p_group_id: string; p_user_id: string }; Returns: Json }
      my_group_invitations: {
        Args: Record<string, never>
        Returns: {
          id: string
          group_id: string
          group_name: string
          course_code: string | null
          course_name: string | null
          inviter_name: string | null
          inviter_avatar: string | null
          member_count: number
          created_at: string
        }[]
      }
      group_sent_invitations: {
        Args: { p_group_id: string }
        Returns: { id: string; user_id: string; full_name: string; avatar_url: string | null; status: 'pending' | 'declined'; created_at: string }[]
      }
      respond_group_invitation: { Args: { p_invitation_id: string; p_accept: boolean }; Returns: string }
      set_email_digest: { Args: { p_enabled: boolean }; Returns: boolean }
      check_rate_limit: { Args: { p_bucket: string; p_max: number; p_window_seconds?: number }; Returns: undefined }
      register_push_subscription: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string | null }
        Returns: undefined
      }
    }
    Enums: {
      task_type: TaskType
      priority_level: PriorityLevel
      task_status: TaskStatus
      exam_type: ExamType
      block_name: BlockName
      course_color: CourseColor
      group_role: GroupRole
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']
export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row']
