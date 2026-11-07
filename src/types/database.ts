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
      assets: {
        Row: {
          bucket: string
          byte_size: number
          created_at: string
          deleted_at: string | null
          id: string
          mime_type: string
          revision: number
          source_type: string
          status: string
          storage_path: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bucket: string
          byte_size: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type: string
          revision?: number
          source_type?: string
          status?: string
          storage_path: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bucket?: string
          byte_size?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type?: string
          revision?: number
          source_type?: string
          status?: string
          storage_path?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      capsule_items: {
        Row: {
          capsule_id: string
          wardrobe_item_id: string
          workspace_id: string
        }
        Insert: {
          capsule_id: string
          wardrobe_item_id: string
          workspace_id: string
        }
        Update: {
          capsule_id?: string
          wardrobe_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_items_workspace_id_capsule_id_fkey"
            columns: ["workspace_id", "capsule_id"]
            isOneToOne: false
            referencedRelation: "capsules"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "capsule_items_workspace_id_wardrobe_item_id_fkey"
            columns: ["workspace_id", "wardrobe_item_id"]
            isOneToOne: false
            referencedRelation: "active_owned_wardrobe"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "capsule_items_workspace_id_wardrobe_item_id_fkey"
            columns: ["workspace_id", "wardrobe_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      capsule_outfit_items: {
        Row: {
          capsule_id: string
          outfit_id: string
          position: number
          wardrobe_item_id: string
          workspace_id: string
        }
        Insert: {
          capsule_id: string
          outfit_id: string
          position: number
          wardrobe_item_id: string
          workspace_id: string
        }
        Update: {
          capsule_id?: string
          outfit_id?: string
          position?: number
          wardrobe_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_outfit_items_workspace_id_capsule_id_outfit_id_fkey"
            columns: ["workspace_id", "capsule_id", "outfit_id"]
            isOneToOne: false
            referencedRelation: "capsule_outfits"
            referencedColumns: ["workspace_id", "capsule_id", "id"]
          },
          {
            foreignKeyName: "capsule_outfit_items_workspace_id_capsule_id_wardrobe_item_fkey"
            columns: ["workspace_id", "capsule_id", "wardrobe_item_id"]
            isOneToOne: false
            referencedRelation: "capsule_items"
            referencedColumns: [
              "workspace_id",
              "capsule_id",
              "wardrobe_item_id",
            ]
          },
        ]
      }
      capsule_outfits: {
        Row: {
          capsule_id: string
          created_at: string
          explanation: Json
          id: string
          inputs_used: Json
          proposed_slots: Json
          rationale: string
          source_revision: number
          source_type: string
          title: string
          uncertainty: Json
          workspace_id: string
        }
        Insert: {
          capsule_id: string
          created_at?: string
          explanation?: Json
          id?: string
          inputs_used?: Json
          proposed_slots?: Json
          rationale?: string
          source_revision: number
          source_type?: string
          title: string
          uncertainty?: Json
          workspace_id: string
        }
        Update: {
          capsule_id?: string
          created_at?: string
          explanation?: Json
          id?: string
          inputs_used?: Json
          proposed_slots?: Json
          rationale?: string
          source_revision?: number
          source_type?: string
          title?: string
          uncertainty?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_outfits_workspace_id_capsule_id_fkey"
            columns: ["workspace_id", "capsule_id"]
            isOneToOne: false
            referencedRelation: "capsules"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      capsules: {
        Row: {
          brief: Json
          created_at: string
          description: string
          id: string
          missing_additions: Json
          occasion: string | null
          revision: number
          season: string | null
          timeframe: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brief?: Json
          created_at?: string
          description?: string
          id?: string
          missing_additions?: Json
          occasion?: string | null
          revision?: number
          season?: string | null
          timeframe?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brief?: Json
          created_at?: string
          description?: string
          id?: string
          missing_additions?: Json
          occasion?: string | null
          revision?: number
          season?: string | null
          timeframe?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_pieces: {
        Row: {
          attributes: Json
          category: string
          confidence: number | null
          corrections: Json
          created_at: string
          description: string
          id: string
          image_context: Json
          look_id: string
          name: string
          position: number
          provenance: Json
          removed_at: string | null
          revision: number
          source_type: string
          subcategory: string | null
          uncertainty: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attributes?: Json
          category: string
          confidence?: number | null
          corrections?: Json
          created_at?: string
          description?: string
          id?: string
          image_context?: Json
          look_id: string
          name: string
          position?: number
          provenance?: Json
          removed_at?: string | null
          revision?: number
          source_type?: string
          subcategory?: string | null
          uncertainty?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attributes?: Json
          category?: string
          confidence?: number | null
          corrections?: Json
          created_at?: string
          description?: string
          id?: string
          image_context?: Json
          look_id?: string
          name?: string
          position?: number
          provenance?: Json
          removed_at?: string | null
          revision?: number
          source_type?: string
          subcategory?: string | null
          uncertainty?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_pieces_workspace_id_look_id_fkey"
            columns: ["workspace_id", "look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      look_reviews: {
        Row: {
          created_at: string
          explanation: Json
          id: string
          inputs_used: Json
          look_id: string
          preference_revision: number | null
          source_revision: number
          source_type: string
          uncertainty: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          explanation: Json
          id?: string
          inputs_used?: Json
          look_id: string
          preference_revision?: number | null
          source_revision: number
          source_type?: string
          uncertainty?: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          explanation?: Json
          id?: string
          inputs_used?: Json
          look_id?: string
          preference_revision?: number | null
          source_revision?: number
          source_type?: string
          uncertainty?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "look_reviews_workspace_id_look_id_fkey"
            columns: ["workspace_id", "look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      look_selection_items: {
        Row: {
          look_id: string
          option_id: string
          option_item_id: string
          selection_id: string
          slot_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          look_id: string
          option_id: string
          option_item_id: string
          selection_id: string
          slot_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          look_id?: string
          option_id?: string
          option_item_id?: string
          selection_id?: string
          slot_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "look_selection_items_workspace_id_look_id_option_id_slot_i_fkey"
            columns: [
              "workspace_id",
              "look_id",
              "option_id",
              "slot_id",
              "option_item_id",
            ]
            isOneToOne: false
            referencedRelation: "outfit_option_items"
            referencedColumns: [
              "workspace_id",
              "look_id",
              "option_id",
              "slot_id",
              "id",
            ]
          },
          {
            foreignKeyName: "look_selection_items_workspace_id_selection_id_look_id_opt_fkey"
            columns: ["workspace_id", "selection_id", "look_id", "option_id"]
            isOneToOne: false
            referencedRelation: "look_selections"
            referencedColumns: ["workspace_id", "id", "look_id", "option_id"]
          },
        ]
      }
      look_selections: {
        Row: {
          created_at: string
          id: string
          look_id: string
          option_id: string
          revision: number
          source_option_revision: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          look_id: string
          option_id: string
          revision?: number
          source_option_revision: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          look_id?: string
          option_id?: string
          revision?: number
          source_option_revision?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "look_selections_workspace_id_look_id_option_id_fkey"
            columns: ["workspace_id", "look_id", "option_id"]
            isOneToOne: true
            referencedRelation: "outfit_options"
            referencedColumns: ["workspace_id", "look_id", "id"]
          },
        ]
      }
      looks: {
        Row: {
          created_at: string
          id: string
          inspiration_asset_id: string | null
          notes: string
          occasion: string | null
          provider_metadata: Json
          revision: number
          selected_option_id: string | null
          source_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspiration_asset_id?: string | null
          notes?: string
          occasion?: string | null
          provider_metadata?: Json
          revision?: number
          selected_option_id?: string | null
          source_type?: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inspiration_asset_id?: string | null
          notes?: string
          occasion?: string | null
          provider_metadata?: Json
          revision?: number
          selected_option_id?: string | null
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "looks_selected_option_parent_fk"
            columns: ["workspace_id", "id", "selected_option_id"]
            isOneToOne: false
            referencedRelation: "outfit_options"
            referencedColumns: ["workspace_id", "look_id", "id"]
          },
          {
            foreignKeyName: "looks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "looks_workspace_id_inspiration_asset_id_fkey"
            columns: ["workspace_id", "inspiration_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      outfit_option_items: {
        Row: {
          candidate_position: number
          category: string
          created_at: string
          id: string
          item_kind: string
          look_id: string
          missing_brief: Json | null
          option_id: string
          piece_id: string | null
          position: number
          product_id: string | null
          rationale: string
          requested_brief: string | null
          requested_category: string | null
          revision: number
          slot_id: string
          updated_at: string
          wardrobe_item_id: string | null
          workspace_id: string
        }
        Insert: {
          candidate_position?: number
          category: string
          created_at?: string
          id?: string
          item_kind: string
          look_id: string
          missing_brief?: Json | null
          option_id: string
          piece_id?: string | null
          position?: number
          product_id?: string | null
          rationale?: string
          requested_brief?: string | null
          requested_category?: string | null
          revision?: number
          slot_id: string
          updated_at?: string
          wardrobe_item_id?: string | null
          workspace_id: string
        }
        Update: {
          candidate_position?: number
          category?: string
          created_at?: string
          id?: string
          item_kind?: string
          look_id?: string
          missing_brief?: Json | null
          option_id?: string
          piece_id?: string | null
          position?: number
          product_id?: string | null
          rationale?: string
          requested_brief?: string | null
          requested_category?: string | null
          revision?: number
          slot_id?: string
          updated_at?: string
          wardrobe_item_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outfit_option_items_workspace_id_look_id_option_id_fkey"
            columns: ["workspace_id", "look_id", "option_id"]
            isOneToOne: false
            referencedRelation: "outfit_options"
            referencedColumns: ["workspace_id", "look_id", "id"]
          },
          {
            foreignKeyName: "outfit_option_items_workspace_id_look_id_piece_id_fkey"
            columns: ["workspace_id", "look_id", "piece_id"]
            isOneToOne: false
            referencedRelation: "inspiration_pieces"
            referencedColumns: ["workspace_id", "look_id", "id"]
          },
          {
            foreignKeyName: "outfit_option_items_workspace_id_product_id_category_fkey"
            columns: ["workspace_id", "product_id", "category"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id", "category"]
          },
          {
            foreignKeyName: "outfit_option_items_workspace_id_wardrobe_item_id_category_fkey"
            columns: ["workspace_id", "wardrobe_item_id", "category"]
            isOneToOne: false
            referencedRelation: "active_owned_wardrobe"
            referencedColumns: ["workspace_id", "id", "category"]
          },
          {
            foreignKeyName: "outfit_option_items_workspace_id_wardrobe_item_id_category_fkey"
            columns: ["workspace_id", "wardrobe_item_id", "category"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["workspace_id", "id", "category"]
          },
        ]
      }
      outfit_options: {
        Row: {
          concept: string
          created_at: string
          explanation: Json
          id: string
          inputs_used: Json
          look_id: string
          option_type: string
          provider_metadata: Json
          rationale: string
          revision: number
          source_revision: number
          source_type: string
          status: string
          title: string
          uncertainty: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          concept?: string
          created_at?: string
          explanation?: Json
          id?: string
          inputs_used?: Json
          look_id: string
          option_type: string
          provider_metadata?: Json
          rationale?: string
          revision?: number
          source_revision: number
          source_type?: string
          status?: string
          title: string
          uncertainty?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          concept?: string
          created_at?: string
          explanation?: Json
          id?: string
          inputs_used?: Json
          look_id?: string
          option_type?: string
          provider_metadata?: Json
          rationale?: string
          revision?: number
          source_revision?: number
          source_type?: string
          status?: string
          title?: string
          uncertainty?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outfit_options_workspace_id_look_id_fkey"
            columns: ["workspace_id", "look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          category: string
          commercial_disclosure: string | null
          corrections: Json
          created_at: string
          currency: string | null
          description: string
          id: string
          image_url: string | null
          price_minor: number | null
          product_url: string
          provenance: Json
          provider: string
          provider_product_id: string
          rating: number | null
          retrieved_at: string
          review_count: number | null
          revision: number
          shipping_minor: number | null
          source_label: string
          source_type: string
          subcategory: string | null
          title: string
          uncertainty: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attributes?: Json
          category: string
          commercial_disclosure?: string | null
          corrections?: Json
          created_at?: string
          currency?: string | null
          description?: string
          id?: string
          image_url?: string | null
          price_minor?: number | null
          product_url: string
          provenance?: Json
          provider: string
          provider_product_id: string
          rating?: number | null
          retrieved_at?: string
          review_count?: number | null
          revision?: number
          shipping_minor?: number | null
          source_label: string
          source_type?: string
          subcategory?: string | null
          title: string
          uncertainty?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attributes?: Json
          category?: string
          commercial_disclosure?: string | null
          corrections?: Json
          created_at?: string
          currency?: string | null
          description?: string
          id?: string
          image_url?: string | null
          price_minor?: number | null
          product_url?: string
          provenance?: Json
          provider?: string
          provider_product_id?: string
          rating?: number | null
          retrieved_at?: string
          review_count?: number | null
          revision?: number
          shipping_minor?: number | null
          source_label?: string
          source_type?: string
          subcategory?: string | null
          title?: string
          uncertainty?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_look_media: {
        Row: {
          created_at: string
          id: string
          operation_id: string
          output_asset_id: string | null
          preference_snapshot_hash: string
          saved_look_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          operation_id: string
          output_asset_id?: string | null
          preference_snapshot_hash: string
          saved_look_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          operation_id?: string
          output_asset_id?: string | null
          preference_snapshot_hash?: string
          saved_look_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_look_media_workspace_id_operation_id_fkey"
            columns: ["workspace_id", "operation_id"]
            isOneToOne: true
            referencedRelation: "workflow_operations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "saved_look_media_workspace_id_output_asset_id_fkey"
            columns: ["workspace_id", "output_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "saved_look_media_workspace_id_saved_look_id_fkey"
            columns: ["workspace_id", "saved_look_id"]
            isOneToOne: false
            referencedRelation: "saved_look_snapshots"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      saved_look_snapshots: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          inputs_used: Json
          items: Json
          look_id: string | null
          option_id: string | null
          preference_snapshot: Json
          rationale: string
          selection_revision: number | null
          source_kind: string
          source_revision: number
          source_type: string
          spend_currency: string | null
          spend_minor: number | null
          title: string
          uncertainty: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          inputs_used?: Json
          items: Json
          look_id?: string | null
          option_id?: string | null
          preference_snapshot?: Json
          rationale?: string
          selection_revision?: number | null
          source_kind?: string
          source_revision: number
          source_type?: string
          spend_currency?: string | null
          spend_minor?: number | null
          title: string
          uncertainty?: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          inputs_used?: Json
          items?: Json
          look_id?: string | null
          option_id?: string | null
          preference_snapshot?: Json
          rationale?: string
          selection_revision?: number | null
          source_kind?: string
          source_revision?: number
          source_type?: string
          spend_currency?: string | null
          spend_minor?: number | null
          title?: string
          uncertainty?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_look_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_look_snapshots_workspace_id_look_id_fkey"
            columns: ["workspace_id", "look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "saved_look_snapshots_workspace_id_look_id_option_id_fkey"
            columns: ["workspace_id", "look_id", "option_id"]
            isOneToOne: false
            referencedRelation: "outfit_options"
            referencedColumns: ["workspace_id", "look_id", "id"]
          },
        ]
      }
      share_links: {
        Row: {
          approved_media_ids: string[]
          catchphrase: string
          created_at: string
          expires_at: string
          id: string
          public_snapshot: Json
          revoked_at: string | null
          saved_look_id: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          approved_media_ids?: string[]
          catchphrase?: string
          created_at?: string
          expires_at: string
          id?: string
          public_snapshot: Json
          revoked_at?: string | null
          saved_look_id: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          approved_media_ids?: string[]
          catchphrase?: string
          created_at?: string
          expires_at?: string
          id?: string
          public_snapshot?: Json
          revoked_at?: string | null
          saved_look_id?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_workspace_id_saved_look_id_fkey"
            columns: ["workspace_id", "saved_look_id"]
            isOneToOne: false
            referencedRelation: "saved_look_snapshots"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      shopping_results: {
        Row: {
          created_at: string
          explanation: string
          factors: Json
          position: number
          product_id: string
          score_version: string
          search_id: string
          value_score: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          explanation?: string
          factors?: Json
          position: number
          product_id: string
          score_version?: string
          search_id: string
          value_score?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          explanation?: string
          factors?: Json
          position?: number
          product_id?: string
          score_version?: string
          search_id?: string
          value_score?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_results_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "shopping_results_workspace_id_search_id_fkey"
            columns: ["workspace_id", "search_id"]
            isOneToOne: false
            referencedRelation: "shopping_searches"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      shopping_searches: {
        Row: {
          country: string
          created_at: string
          error_code: string | null
          id: string
          input_fingerprint: string
          look_id: string
          option_id: string
          option_item_id: string
          option_revision: number
          provider: string
          query: string
          score_version: string
          score_weights: Json
          slot_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          country?: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_fingerprint: string
          look_id: string
          option_id: string
          option_item_id: string
          option_revision: number
          provider: string
          query: string
          score_version?: string
          score_weights?: Json
          slot_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          country?: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_fingerprint?: string
          look_id?: string
          option_id?: string
          option_item_id?: string
          option_revision?: number
          provider?: string
          query?: string
          score_version?: string
          score_weights?: Json
          slot_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_searches_workspace_id_look_id_option_id_slot_id_o_fkey"
            columns: [
              "workspace_id",
              "look_id",
              "option_id",
              "slot_id",
              "option_item_id",
            ]
            isOneToOne: false
            referencedRelation: "outfit_option_items"
            referencedColumns: [
              "workspace_id",
              "look_id",
              "option_id",
              "slot_id",
              "id",
            ]
          },
        ]
      }
      user_preferences: {
        Row: {
          body_profile: Json
          created_at: string
          display_name: string | null
          fit_preferences: Json
          revision: number
          style_dna: Json
          style_notes: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body_profile?: Json
          created_at?: string
          display_name?: string | null
          fit_preferences?: Json
          revision?: number
          style_dna?: Json
          style_notes?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body_profile?: Json
          created_at?: string
          display_name?: string | null
          fit_preferences?: Json
          revision?: number
          style_dna?: Json
          style_notes?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wardrobe_items: {
        Row: {
          archived_at: string | null
          asset_id: string | null
          attributes: Json
          category: string
          color: string
          confidence: number | null
          corrections: Json
          created_at: string
          description: string
          id: string
          import_idempotency_key: string | null
          inferred_attributes: Json
          inventory_status: string
          name: string
          notes: string
          provenance: Json
          revision: number
          source_product_id: string | null
          source_type: string
          subcategory: string | null
          uncertainty: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          asset_id?: string | null
          attributes?: Json
          category: string
          color?: string
          confidence?: number | null
          corrections?: Json
          created_at?: string
          description?: string
          id?: string
          import_idempotency_key?: string | null
          inferred_attributes?: Json
          inventory_status?: string
          name: string
          notes?: string
          provenance?: Json
          revision?: number
          source_product_id?: string | null
          source_type?: string
          subcategory?: string | null
          uncertainty?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          asset_id?: string | null
          attributes?: Json
          category?: string
          color?: string
          confidence?: number | null
          corrections?: Json
          created_at?: string
          description?: string
          id?: string
          import_idempotency_key?: string | null
          inferred_attributes?: Json
          inventory_status?: string
          name?: string
          notes?: string
          provenance?: Json
          revision?: number
          source_product_id?: string | null
          source_type?: string
          subcategory?: string | null
          uncertainty?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_items_workspace_id_asset_id_fkey"
            columns: ["workspace_id", "asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "wardrobe_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wardrobe_items_workspace_id_source_product_id_fkey"
            columns: ["workspace_id", "source_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      wardrobe_matches: {
        Row: {
          confidence: number | null
          created_at: string
          differences: Json
          evidence_coverage: number | null
          id: string
          look_id: string
          match_type: string
          piece_id: string
          rationale: string
          rejected_candidates: Json
          shared_attributes: Json
          source_revision: number
          source_type: string
          wardrobe_item_id: string | null
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          differences?: Json
          evidence_coverage?: number | null
          id?: string
          look_id: string
          match_type: string
          piece_id: string
          rationale: string
          rejected_candidates?: Json
          shared_attributes?: Json
          source_revision: number
          source_type?: string
          wardrobe_item_id?: string | null
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          differences?: Json
          evidence_coverage?: number | null
          id?: string
          look_id?: string
          match_type?: string
          piece_id?: string
          rationale?: string
          rejected_candidates?: Json
          shared_attributes?: Json
          source_revision?: number
          source_type?: string
          wardrobe_item_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_matches_workspace_id_look_id_piece_id_fkey"
            columns: ["workspace_id", "look_id", "piece_id"]
            isOneToOne: false
            referencedRelation: "inspiration_pieces"
            referencedColumns: ["workspace_id", "look_id", "id"]
          },
          {
            foreignKeyName: "wardrobe_matches_workspace_id_wardrobe_item_id_fkey"
            columns: ["workspace_id", "wardrobe_item_id"]
            isOneToOne: false
            referencedRelation: "active_owned_wardrobe"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "wardrobe_matches_workspace_id_wardrobe_item_id_fkey"
            columns: ["workspace_id", "wardrobe_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workflow_drafts: {
        Row: {
          asset_id: string | null
          capsule_id: string | null
          created_at: string
          current_step: string | null
          feature_kind: string
          id: string
          look_id: string | null
          payload: Json
          revision: number
          status: string
          updated_at: string
          visited_steps: Json
          workspace_id: string
        }
        Insert: {
          asset_id?: string | null
          capsule_id?: string | null
          created_at?: string
          current_step?: string | null
          feature_kind: string
          id?: string
          look_id?: string | null
          payload?: Json
          revision?: number
          status?: string
          updated_at?: string
          visited_steps?: Json
          workspace_id: string
        }
        Update: {
          asset_id?: string | null
          capsule_id?: string | null
          created_at?: string
          current_step?: string | null
          feature_kind?: string
          id?: string
          look_id?: string | null
          payload?: Json
          revision?: number
          status?: string
          updated_at?: string
          visited_steps?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_drafts_workspace_id_asset_id_fkey"
            columns: ["workspace_id", "asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "workflow_drafts_workspace_id_capsule_id_fkey"
            columns: ["workspace_id", "capsule_id"]
            isOneToOne: false
            referencedRelation: "capsules"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "workflow_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_drafts_workspace_id_look_id_fkey"
            columns: ["workspace_id", "look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workflow_operation_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          operation_id: string
          payload: Json
          sequence: number
          source_revision: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          operation_id: string
          payload?: Json
          sequence: number
          source_revision: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          operation_id?: string
          payload?: Json
          sequence?: number
          source_revision?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_operation_events_workspace_id_operation_id_fkey"
            columns: ["workspace_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "workflow_operations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workflow_operations: {
        Row: {
          attempt_count: number
          cancel_requested_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          input: Json
          input_fingerprint: string
          input_revision: number
          kind: string
          lease_until: string | null
          model: string | null
          prompt_version: string | null
          provider_request_id: string | null
          result_ref: Json | null
          safe_error_code: string | null
          schema_version: string | null
          status: string
          subject_id: string
          subject_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          cancel_requested_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          input?: Json
          input_fingerprint: string
          input_revision: number
          kind: string
          lease_until?: string | null
          model?: string | null
          prompt_version?: string | null
          provider_request_id?: string | null
          result_ref?: Json | null
          safe_error_code?: string | null
          schema_version?: string | null
          status?: string
          subject_id: string
          subject_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          cancel_requested_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          input?: Json
          input_fingerprint?: string
          input_revision?: number
          kind?: string
          lease_until?: string | null
          model?: string | null
          prompt_version?: string | null
          provider_request_id?: string | null
          result_ref?: Json | null
          safe_error_code?: string | null
          schema_version?: string | null
          status?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          revision: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          revision?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          revision?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_owned_wardrobe: {
        Row: {
          archived_at: string | null
          asset_id: string | null
          attributes: Json | null
          category: string | null
          color: string | null
          confidence: number | null
          corrections: Json | null
          created_at: string | null
          description: string | null
          id: string | null
          import_idempotency_key: string | null
          inferred_attributes: Json | null
          inventory_status: string | null
          name: string | null
          notes: string | null
          provenance: Json | null
          revision: number | null
          source_product_id: string | null
          source_type: string | null
          subcategory: string | null
          uncertainty: Json | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          archived_at?: string | null
          asset_id?: string | null
          attributes?: Json | null
          category?: string | null
          color?: string | null
          confidence?: number | null
          corrections?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          import_idempotency_key?: string | null
          inferred_attributes?: Json | null
          inventory_status?: string | null
          name?: string | null
          notes?: string | null
          provenance?: Json | null
          revision?: number | null
          source_product_id?: string | null
          source_type?: string | null
          subcategory?: string | null
          uncertainty?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          archived_at?: string | null
          asset_id?: string | null
          attributes?: Json | null
          category?: string | null
          color?: string | null
          confidence?: number | null
          corrections?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          import_idempotency_key?: string | null
          inferred_attributes?: Json | null
          inventory_status?: string | null
          name?: string | null
          notes?: string | null
          provenance?: Json | null
          revision?: number | null
          source_product_id?: string | null
          source_type?: string | null
          subcategory?: string | null
          uncertainty?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_items_workspace_id_asset_id_fkey"
            columns: ["workspace_id", "asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "wardrobe_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wardrobe_items_workspace_id_source_product_id_fkey"
            columns: ["workspace_id", "source_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
    }
    Functions: {
      claim_workflow_operation: {
        Args: {
          p_input_revision: number
          p_lease_seconds?: number
          p_operation_id: string
          p_workspace_id: string
        }
        Returns: {
          attempt_count: number
          cancel_requested_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          input: Json
          input_fingerprint: string
          input_revision: number
          kind: string
          lease_until: string | null
          model: string | null
          prompt_version: string | null
          provider_request_id: string | null
          result_ref: Json | null
          safe_error_code: string | null
          schema_version: string | null
          status: string
          subject_id: string
          subject_type: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_look_selection: {
        Args: {
          p_choices: Json
          p_expected_revision: number
          p_look_id: string
          p_option_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          look_id: string
          option_id: string
          revision: number
          source_option_revision: number
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "look_selections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_look_snapshot: {
        Args: {
          p_expected_revision: number
          p_idempotency_key: string
          p_look_id: string
          p_option_id: string
          p_title: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          idempotency_key: string
          inputs_used: Json
          items: Json
          look_id: string | null
          option_id: string | null
          preference_snapshot: Json
          rationale: string
          selection_revision: number | null
          source_kind: string
          source_revision: number
          source_type: string
          spend_currency: string | null
          spend_minor: number | null
          title: string
          uncertainty: Json
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_look_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_workflow_operation: {
        Args: {
          p_input?: Json
          p_input_fingerprint: string
          p_input_revision: number
          p_kind: string
          p_model?: string
          p_prompt_version?: string
          p_schema_version?: string
          p_subject_id: string
          p_subject_type: string
          p_workspace_id: string
        }
        Returns: {
          attempt_count: number
          cancel_requested_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          input: Json
          input_fingerprint: string
          input_revision: number
          kind: string
          lease_until: string | null
          model: string | null
          prompt_version: string | null
          provider_request_id: string | null
          result_ref: Json | null
          safe_error_code: string | null
          schema_version: string | null
          status: string
          subject_id: string
          subject_type: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stylora_subject_revision: {
        Args: {
          p_subject_id: string
          p_subject_type: string
          p_workspace_id: string
        }
        Returns: number
      }
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
    Enums: {},
  },
} as const
