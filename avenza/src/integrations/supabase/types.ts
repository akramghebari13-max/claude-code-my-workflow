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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          archived: boolean
          business_id: string
          code: string
          created_at: string
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          archived?: boolean
          business_id: string
          code: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          archived?: boolean
          business_id?: string
          code?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id: string
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          amount_pence: number
          bank_account_id: string
          business_id: string
          created_at: string
          description: string
          fingerprint: string
          id: string
          invoice_id: string | null
          line_date: string
          reconciled_at: string | null
          reconciled_by: string | null
          status: Database["public"]["Enums"]["bank_line_status"]
          transaction_id: string | null
        }
        Insert: {
          amount_pence: number
          bank_account_id: string
          business_id: string
          created_at?: string
          description: string
          fingerprint: string
          id?: string
          invoice_id?: string | null
          line_date: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: Database["public"]["Enums"]["bank_line_status"]
          transaction_id?: string | null
        }
        Update: {
          amount_pence?: number
          bank_account_id?: string
          business_id?: string
          created_at?: string
          description?: string
          fingerprint?: string
          id?: string
          invoice_id?: string | null
          line_date?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: Database["public"]["Enums"]["bank_line_status"]
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          role?: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["business_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          company_number: string | null
          created_at: string
          created_by: string
          flat_rate_bp: number
          id: string
          name: string
          registered_in: Database["public"]["Enums"]["uk_jurisdiction"] | null
          updated_at: string
          utr: string | null
          vat_number: string | null
          vat_registered: boolean
          vat_scheme: Database["public"]["Enums"]["vat_scheme"]
          year_end_day: number
          year_end_month: number
        }
        Insert: {
          address?: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          company_number?: string | null
          created_at?: string
          created_by?: string
          flat_rate_bp?: number
          id?: string
          name: string
          registered_in?: Database["public"]["Enums"]["uk_jurisdiction"] | null
          updated_at?: string
          utr?: string | null
          vat_number?: string | null
          vat_registered?: boolean
          vat_scheme?: Database["public"]["Enums"]["vat_scheme"]
          year_end_day?: number
          year_end_month?: number
        }
        Update: {
          address?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          company_number?: string | null
          created_at?: string
          created_by?: string
          flat_rate_bp?: number
          id?: string
          name?: string
          registered_in?: Database["public"]["Enums"]["uk_jurisdiction"] | null
          updated_at?: string
          utr?: string | null
          vat_number?: string | null
          vat_registered?: boolean
          vat_scheme?: Database["public"]["Enums"]["vat_scheme"]
          year_end_day?: number
          year_end_month?: number
        }
        Relationships: []
      }
      credit_notes: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          credit_date: string
          credit_number: string
          entry_id: string
          id: string
          invoice_id: string
          net_pence: number
          reason: string | null
          refund_date: string | null
          refund_entry_id: string | null
          vat_pence: number
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string
          credit_date: string
          credit_number: string
          entry_id: string
          id?: string
          invoice_id: string
          net_pence: number
          reason?: string | null
          refund_date?: string | null
          refund_entry_id?: string | null
          vat_pence: number
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          credit_date?: string
          credit_number?: string
          entry_id?: string
          id?: string
          invoice_id?: string
          net_pence?: number
          reason?: string | null
          refund_date?: string | null
          refund_entry_id?: string | null
          vat_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_refund_entry_id_fkey"
            columns: ["refund_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          email: string | null
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hmrc_connections: {
        Row: {
          access_token: string
          business_id: string
          connected_at: string
          connected_by: string | null
          customer_name: string | null
          is_sandbox: boolean
          mtd_vat_id: string
          refresh_token: string
          scope: string | null
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          business_id: string
          connected_at?: string
          connected_by?: string | null
          customer_name?: string | null
          is_sandbox?: boolean
          mtd_vat_id: string
          refresh_token: string
          scope?: string | null
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          business_id?: string
          connected_at?: string
          connected_by?: string | null
          customer_name?: string | null
          is_sandbox?: boolean
          mtd_vat_id?: string
          refresh_token?: string
          scope?: string | null
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hmrc_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hmrc_itsa_connections: {
        Row: {
          access_token: string
          business_id: string
          connected_at: string
          is_sandbox: boolean
          nino: string
          refresh_token: string
          scope: string | null
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          business_id: string
          connected_at?: string
          is_sandbox?: boolean
          nino: string
          refresh_token: string
          scope?: string | null
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          business_id?: string
          connected_at?: string
          is_sandbox?: boolean
          nino?: string
          refresh_token?: string
          scope?: string | null
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hmrc_itsa_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hmrc_oauth_states: {
        Row: {
          business_id: string
          created_at: string
          is_sandbox: boolean
          nino: string | null
          purpose: string
          redirect_uri: string
          state: string
        }
        Insert: {
          business_id: string
          created_at?: string
          is_sandbox?: boolean
          nino?: string | null
          purpose?: string
          redirect_uri: string
          state: string
        }
        Update: {
          business_id?: string
          created_at?: string
          is_sandbox?: boolean
          nino?: string | null
          purpose?: string
          redirect_uri?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "hmrc_oauth_states_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          business_id: string
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          unit_pence: number
          vat_rate_bp: number
        }
        Insert: {
          business_id: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          unit_pence: number
          vat_rate_bp?: number
        }
        Update: {
          business_id?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          unit_pence?: number
          vat_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          issue_entry_id: string | null
          net_pence: number
          notes: string | null
          paid_date: string | null
          payment_entry_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          vat_pence: number
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          due_date: string
          id?: string
          invoice_number: string
          issue_date?: string
          issue_entry_id?: string | null
          net_pence?: number
          notes?: string | null
          paid_date?: string | null
          payment_entry_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          vat_pence?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          issue_entry_id?: string | null
          net_pence?: number
          notes?: string | null
          paid_date?: string | null
          payment_entry_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          vat_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_issue_entry_id_fkey"
            columns: ["issue_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_entry_id_fkey"
            columns: ["payment_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      itsa_submissions: {
        Row: {
          business_id: string
          calculation_id: string | null
          figures: Json | null
          hmrc_business_id: string | null
          id: string
          is_sandbox: boolean
          kind: string
          receipt: Json | null
          submitted_at: string
          submitted_by: string | null
          tax_year: string
        }
        Insert: {
          business_id: string
          calculation_id?: string | null
          figures?: Json | null
          hmrc_business_id?: string | null
          id?: string
          is_sandbox?: boolean
          kind: string
          receipt?: Json | null
          submitted_at?: string
          submitted_by?: string | null
          tax_year: string
        }
        Update: {
          business_id?: string
          calculation_id?: string | null
          figures?: Json | null
          hmrc_business_id?: string | null
          id?: string
          is_sandbox?: boolean
          kind?: string
          receipt?: Json | null
          submitted_at?: string
          submitted_by?: string | null
          tax_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "itsa_submissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          description: string
          entry_date: string
          entry_number: number
          id: string
          reference: string | null
          reverses_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string
          description: string
          entry_date: string
          entry_number: number
          id?: string
          reference?: string | null
          reverses_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          description?: string
          entry_date?: string
          entry_number?: number
          id?: string
          reference?: string | null
          reverses_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          business_id: string
          credit_pence: number
          debit_pence: number
          entry_id: string
          id: string
          memo: string | null
        }
        Insert: {
          account_id: string
          business_id: string
          credit_pence?: number
          debit_pence?: number
          entry_id: string
          id?: string
          memo?: string | null
        }
        Update: {
          account_id?: string
          business_id?: string
          credit_pence?: number
          debit_pence?: number
          entry_id?: string
          id?: string
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      pf_assistant_usage: {
        Row: {
          access_denied_message: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          access_denied_message?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Update: {
          access_denied_message?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      pf_bills: {
        Row: {
          active: boolean
          amount_pence: number
          anchor_day: number | null
          category_id: string
          created_at: string
          frequency: string
          id: string
          name: string
          next_due_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount_pence: number
          anchor_day?: number | null
          category_id: string
          created_at?: string
          frequency: string
          id?: string
          name: string
          next_due_date: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          amount_pence?: number
          anchor_day?: number | null
          category_id?: string
          created_at?: string
          frequency?: string
          id?: string
          name?: string
          next_due_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pf_bills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pf_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pf_budgets: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          monthly_limit_pence: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          monthly_limit_pence: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          monthly_limit_pence?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pf_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pf_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pf_categories: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      pf_documents: {
        Row: {
          confirmed_at: string | null
          created_at: string
          doc_type: string
          error_message: string | null
          extracted: Json | null
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          doc_type?: string
          error_message?: string | null
          extracted?: Json | null
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          status?: string
          storage_path: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          doc_type?: string
          error_message?: string | null
          extracted?: Json | null
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pf_goals: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          starting_pence: number
          target_date: string | null
          target_pence: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          starting_pence?: number
          target_date?: string | null
          target_pence: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          starting_pence?: number
          target_date?: string | null
          target_pence?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pf_notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          read_at: string | null
          related_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          read_at?: string | null
          related_id?: string | null
          title: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          read_at?: string | null
          related_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      pf_transactions: {
        Row: {
          amount_pence: number
          category_id: string | null
          created_at: string
          description: string | null
          document_id: string | null
          goal_id: string | null
          id: string
          income_type: string | null
          kind: string
          merchant: string | null
          txn_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_pence: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          goal_id?: string | null
          id?: string
          income_type?: string | null
          kind: string
          merchant?: string | null
          txn_date: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_pence?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          goal_id?: string | null
          id?: string
          income_type?: string | null
          kind?: string
          merchant?: string | null
          txn_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pf_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pf_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pf_transactions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pf_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pf_transactions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "pf_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          bank_account_id: string
          business_id: string
          category_account_id: string
          counterparty: string
          created_at: string
          created_by: string
          description: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          gross_pence: number
          id: string
          journal_entry_id: string | null
          receipt_path: string | null
          txn_date: string
          vat_pence: number
          void_date: string | null
          void_entry_id: string | null
          voided_at: string | null
        }
        Insert: {
          bank_account_id: string
          business_id: string
          category_account_id: string
          counterparty: string
          created_at?: string
          created_by?: string
          description?: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          gross_pence: number
          id?: string
          journal_entry_id?: string | null
          receipt_path?: string | null
          txn_date: string
          vat_pence?: number
          void_date?: string | null
          void_entry_id?: string | null
          voided_at?: string | null
        }
        Update: {
          bank_account_id?: string
          business_id?: string
          category_account_id?: string
          counterparty?: string
          created_at?: string
          created_by?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["txn_direction"]
          gross_pence?: number
          id?: string
          journal_entry_id?: string | null
          receipt_path?: string | null
          txn_date?: string
          vat_pence?: number
          void_date?: string | null
          void_entry_id?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_account_id_fkey"
            columns: ["category_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_category_account_id_fkey"
            columns: ["category_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_void_entry_id_fkey"
            columns: ["void_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_returns: {
        Row: {
          adjustment_entry_id: string | null
          box1: number
          box2: number
          box3: number
          box4: number
          box5: number
          box6: number
          box7: number
          box8: number
          box9: number
          business_id: string
          filed_at: string
          filed_by: string
          hmrc_period_key: string | null
          hmrc_receipt: Json | null
          hmrc_submitted_at: string | null
          hmrc_submitted_by: string | null
          id: string
          period_end: string
          period_start: string
          scheme: Database["public"]["Enums"]["vat_scheme"]
        }
        Insert: {
          adjustment_entry_id?: string | null
          box1: number
          box2: number
          box3: number
          box4: number
          box5: number
          box6: number
          box7: number
          box8: number
          box9: number
          business_id: string
          filed_at?: string
          filed_by?: string
          hmrc_period_key?: string | null
          hmrc_receipt?: Json | null
          hmrc_submitted_at?: string | null
          hmrc_submitted_by?: string | null
          id?: string
          period_end: string
          period_start: string
          scheme: Database["public"]["Enums"]["vat_scheme"]
        }
        Update: {
          adjustment_entry_id?: string | null
          box1?: number
          box2?: number
          box3?: number
          box4?: number
          box5?: number
          box6?: number
          box7?: number
          box8?: number
          box9?: number
          business_id?: string
          filed_at?: string
          filed_by?: string
          hmrc_period_key?: string | null
          hmrc_receipt?: Json | null
          hmrc_submitted_at?: string | null
          hmrc_submitted_by?: string | null
          id?: string
          period_end?: string
          period_start?: string
          scheme?: Database["public"]["Enums"]["vat_scheme"]
        }
        Relationships: [
          {
            foreignKeyName: "vat_returns_adjustment_entry_id_fkey"
            columns: ["adjustment_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          archived: boolean | null
          business_id: string | null
          code: string | null
          credit_pence: number | null
          debit_pence: number | null
          name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _reverse_entry: {
        Args: { _entry_date: string; _entry_id: string }
        Returns: string
      }
      acct: { Args: { _b: string; _code: string }; Returns: string }
      attach_receipt: {
        Args: { _receipt_path: string; _transaction_id: string }
        Returns: undefined
      }
      bank_match_candidates: {
        Args: { _line_id: string }
        Returns: {
          id: string
          kind: string
          label: string
          match_date: string
          signed_pence: number
        }[]
      }
      can_post: { Args: { _business_id: string }; Returns: boolean }
      credit_invoice: {
        Args: {
          _credit_date: string
          _invoice_id: string
          _reason: string
          _refund_bank_account_id: string
        }
        Returns: string
      }
      file_vat_return: {
        Args: { _business_id: string; _end: string; _start: string }
        Returns: string
      }
      has_business_role: {
        Args: {
          _business_id: string
          _role: Database["public"]["Enums"]["business_role"]
        }
        Returns: boolean
      }
      hmrc_connection_status: { Args: { _business_id: string }; Returns: Json }
      hmrc_itsa_status: { Args: { _business_id: string }; Returns: Json }
      import_bank_lines: {
        Args: { _bank_account_id: string; _business_id: string; _lines: Json }
        Returns: number
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      issue_invoice: { Args: { _invoice_id: string }; Returns: undefined }
      journal_owner: { Args: { _entry_id: string }; Returns: string }
      journal_sources: {
        Args: { _business_id: string }
        Returns: {
          entry_id: string
          source: string
        }[]
      }
      money_totals: {
        Args: { _business_id: string; _from: string; _to: string }
        Returns: Json
      }
      pay_invoice: {
        Args: {
          _bank_account_id: string
          _invoice_id: string
          _paid_date: string
        }
        Returns: undefined
      }
      period_balances: {
        Args: { _business_id: string; _from: string; _to: string }
        Returns: {
          account_id: string
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          credit_pence: number
          debit_pence: number
          name: string
        }[]
      }
      pf_advance_due: {
        Args: { _anchor: number; _d: string; _frequency: string }
        Returns: string
      }
      pf_assistant_facts: { Args: { _month: string }; Returns: Json }
      pf_budget_status: {
        Args: { _month: string }
        Returns: {
          budget_id: string
          category_id: string
          limit_pence: number
          name: string
          percentage: number
          spent_pence: number
        }[]
      }
      pf_confirm_document: {
        Args: {
          _amount_pence: number
          _category_id: string
          _description: string
          _doc_type: string
          _document_id: string
          _income_type: string
          _kind: string
          _merchant: string
          _txn_date: string
        }
        Returns: string
      }
      pf_day: { Args: { _d: string }; Returns: string }
      pf_delete_all_my_data: { Args: never; Returns: Json }
      pf_ensure_defaults: { Args: never; Returns: undefined }
      pf_goal_progress: {
        Args: never
        Returns: {
          avg_monthly_saving_pence: number
          goal_id: string
          name: string
          percentage: number
          saved_pence: number
          target_date: string
          target_pence: number
        }[]
      }
      pf_mark_bill_paid: {
        Args: {
          _amount_pence?: number
          _bill_id: string
          _due_date?: string
          _paid_date: string
        }
        Returns: string
      }
      pf_money: { Args: { _p: number }; Returns: string }
      pf_month_categories: {
        Args: { _month: string }
        Returns: {
          category_id: string
          name: string
          total_pence: number
        }[]
      }
      pf_month_summary: {
        Args: { _month: string }
        Returns: {
          expense_pence: number
          income_pence: number
          remaining_pence: number
          saving_pence: number
        }[]
      }
      pf_monthly_series: {
        Args: { _months?: number }
        Returns: {
          expense_pence: number
          income_pence: number
          month: string
          saving_pence: number
        }[]
      }
      pf_owns_category: { Args: { _id: string }; Returns: boolean }
      pf_refresh_notifications: { Args: never; Returns: number }
      pf_uk_today: { Args: never; Returns: string }
      post_journal: {
        Args: {
          _business_id: string
          _description: string
          _entry_date: string
          _lines: Json
          _reference: string
          _reverses_id?: string
        }
        Returns: string
      }
      reconcile_bank_line: {
        Args: {
          _action: string
          _category_account_id: string
          _line_id: string
          _target_id: string
          _vat_pence: number
        }
        Returns: undefined
      }
      record_hmrc_submission: {
        Args: {
          _business_id: string
          _period_key: string
          _receipt: Json
          _return_id: string
        }
        Returns: undefined
      }
      record_itsa_submission: {
        Args: {
          _business_id: string
          _calculation_id: string
          _figures: Json
          _hmrc_business_id: string
          _is_sandbox: boolean
          _kind: string
          _receipt: Json
          _tax_year: string
        }
        Returns: string
      }
      record_transaction: {
        Args: {
          _bank_account_id: string
          _business_id: string
          _category_account_id: string
          _counterparty: string
          _date: string
          _description: string
          _direction: Database["public"]["Enums"]["txn_direction"]
          _gross_pence: number
          _receipt_path: string
          _vat_pence: number
        }
        Returns: string
      }
      reverse_journal: {
        Args: { _entry_date?: string; _entry_id: string }
        Returns: string
      }
      save_invoice: {
        Args: {
          _business_id: string
          _customer_id: string
          _due_date: string
          _invoice_id: string
          _issue_date: string
          _lines: Json
          _notes: string
        }
        Returns: string
      }
      uk_today: { Args: never; Returns: string }
      vat_return_preview: {
        Args: { _business_id: string; _end: string; _start: string }
        Returns: Json
      }
      void_invoice: { Args: { _invoice_id: string }; Returns: undefined }
      void_transaction: {
        Args: { _transaction_id: string; _void_date?: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      bank_line_status: "unmatched" | "matched" | "excluded"
      business_role: "owner" | "accountant" | "staff"
      business_type: "sole_trader" | "limited_company"
      invoice_status: "draft" | "sent" | "paid" | "void"
      txn_direction: "in" | "out"
      uk_jurisdiction: "england_wales" | "scotland" | "northern_ireland"
      vat_scheme: "standard" | "cash" | "flat_rate"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_type: ["asset", "liability", "equity", "income", "expense"],
      bank_line_status: ["unmatched", "matched", "excluded"],
      business_role: ["owner", "accountant", "staff"],
      business_type: ["sole_trader", "limited_company"],
      invoice_status: ["draft", "sent", "paid", "void"],
      txn_direction: ["in", "out"],
      uk_jurisdiction: ["england_wales", "scotland", "northern_ireland"],
      vat_scheme: ["standard", "cash", "flat_rate"],
    },
  },
} as const
