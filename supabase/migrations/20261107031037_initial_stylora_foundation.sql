CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  bucket text NOT NULL CHECK (bucket IN ('inspiration', 'wardrobe', 'previews')),
  storage_path text NOT NULL CHECK (length(storage_path) BETWEEN 1 AND 1024 AND split_part(storage_path, '/', 1) = workspace_id::text AND storage_path !~ '(^|/)\.\.?(/|$)'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'live', 'sample')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'detached', 'deleted')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (bucket, storage_path),
  CHECK (bucket <> 'previews' OR mime_type = 'image/png'),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);

CREATE TABLE public.user_preferences (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id),
  display_name text CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80),
  style_notes text NOT NULL DEFAULT '' CHECK (length(style_notes) <= 4000),
  style_dna jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(style_dna) = 'object' AND octet_length(style_dna::text) <= 16384),
  fit_preferences jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(fit_preferences) = 'object' AND octet_length(fit_preferences::text) <= 16384),
  body_profile jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(body_profile) = 'object' AND octet_length(body_profile::text) <= 16384),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  provider text NOT NULL CHECK (length(btrim(provider)) BETWEEN 1 AND 80),
  provider_product_id text NOT NULL CHECK (length(btrim(provider_product_id)) BETWEEN 1 AND 512),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  category text NOT NULL CHECK (category IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  subcategory text CHECK (length(subcategory) <= 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 600),
  attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object' AND octet_length(attributes::text) <= 8192),
  provenance jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provenance) = 'object' AND octet_length(provenance::text) <= 32768),
  corrections jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(corrections) = 'object' AND octet_length(corrections::text) <= 32768),
  uncertainty jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(uncertainty) = 'array' AND octet_length(uncertainty::text) <= 8192),
  source_label text NOT NULL CHECK (length(btrim(source_label)) BETWEEN 1 AND 240),
  product_url text NOT NULL CHECK (length(product_url) <= 4096 AND product_url ~ '^https://[^[:space:]]+$'),
  image_url text CHECK (image_url IS NULL OR (length(image_url) <= 4096 AND image_url ~ '^https://[^[:space:]]+$')),
  price_minor bigint CHECK (price_minor >= 0),
  shipping_minor bigint CHECK (shipping_minor >= 0),
  currency text CHECK (currency ~ '^[A-Z]{3}$'),
  rating numeric CHECK (rating BETWEEN 0 AND 5),
  review_count integer CHECK (review_count >= 0),
  source_type text NOT NULL DEFAULT 'live' CHECK (source_type IN ('live', 'manual', 'sample')),
  commercial_disclosure text CHECK (length(commercial_disclosure) <= 1000),
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, category),
  UNIQUE (workspace_id, provider, provider_product_id),
  CHECK (price_minor IS NULL OR currency IS NOT NULL),
  CHECK (shipping_minor IS NULL OR currency IS NOT NULL)
);

CREATE TABLE public.wardrobe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  category text NOT NULL CHECK (category IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  subcategory text CHECK (length(subcategory) <= 120),
  color text NOT NULL DEFAULT '' CHECK (length(color) <= 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 600),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object' AND octet_length(attributes::text) <= 8192),
  inferred_attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(inferred_attributes) = 'object' AND octet_length(inferred_attributes::text) <= 8192),
  provenance jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provenance) = 'object' AND octet_length(provenance::text) <= 32768),
  corrections jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(corrections) = 'object' AND octet_length(corrections::text) <= 32768),
  uncertainty jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(uncertainty) = 'array' AND octet_length(uncertainty::text) <= 8192),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  asset_id uuid,
  source_product_id uuid,
  import_idempotency_key text CHECK (length(import_idempotency_key) BETWEEN 1 AND 200),
  inventory_status text NOT NULL DEFAULT 'owned' CHECK (inventory_status IN ('owned', 'saved_candidate')),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'live', 'sample')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, category),
  UNIQUE (workspace_id, import_idempotency_key),
  FOREIGN KEY (workspace_id, asset_id) REFERENCES public.assets(workspace_id, id),
  FOREIGN KEY (workspace_id, source_product_id) REFERENCES public.products(workspace_id, id)
);

CREATE TABLE public.looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  occasion text CHECK (length(occasion) <= 120),
  inspiration_asset_id uuid,
  selected_option_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'analyzed', 'reviewed', 'matched', 'options_ready')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'live', 'sample')),
  provider_metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provider_metadata) = 'object' AND octet_length(provider_metadata::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, inspiration_asset_id) REFERENCES public.assets(workspace_id, id)
);

CREATE TABLE public.inspiration_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  look_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  category text NOT NULL CHECK (category IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  subcategory text CHECK (length(subcategory) <= 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 600),
  attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object' AND octet_length(attributes::text) <= 8192),
  provenance jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provenance) = 'object' AND octet_length(provenance::text) <= 32768),
  corrections jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(corrections) = 'object' AND octet_length(corrections::text) <= 32768),
  uncertainty jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(uncertainty) = 'array' AND octet_length(uncertainty::text) <= 8192),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  image_context jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(image_context) = 'object' AND octet_length(image_context::text) <= 8192),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  source_type text NOT NULL DEFAULT 'live' CHECK (source_type IN ('manual', 'live', 'sample')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, look_id, id),
  FOREIGN KEY (workspace_id, look_id) REFERENCES public.looks(workspace_id, id)
);

CREATE TABLE public.look_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  look_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  preference_revision integer CHECK (preference_revision > 0),
  explanation jsonb NOT NULL CHECK (jsonb_typeof(explanation) = 'object' AND octet_length(explanation::text) <= 65536),
  inputs_used jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(inputs_used) = 'object' AND octet_length(inputs_used::text) <= 16384),
  uncertainty jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(uncertainty) = 'array' AND octet_length(uncertainty::text) <= 8192),
  source_type text NOT NULL DEFAULT 'live' CHECK (source_type IN ('manual', 'live', 'sample')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, look_id) REFERENCES public.looks(workspace_id, id)
);

CREATE TABLE public.wardrobe_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  look_id uuid NOT NULL,
  piece_id uuid NOT NULL,
  wardrobe_item_id uuid,
  match_type text NOT NULL CHECK (match_type IN ('owned_match', 'wardrobe_alternative', 'missing')),
  rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 4000),
  shared_attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(shared_attributes) = 'object' AND octet_length(shared_attributes::text) <= 8192),
  differences jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(differences) = 'object' AND octet_length(differences::text) <= 8192),
  rejected_candidates jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rejected_candidates) = 'array' AND octet_length(rejected_candidates::text) <= 32768),
  evidence_coverage numeric CHECK (evidence_coverage BETWEEN 0 AND 1),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_type text NOT NULL DEFAULT 'live' CHECK (source_type IN ('manual', 'live', 'sample')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, look_id, piece_id) REFERENCES public.inspiration_pieces(workspace_id, look_id, id),
  FOREIGN KEY (workspace_id, wardrobe_item_id) REFERENCES public.wardrobe_items(workspace_id, id),
  CHECK ((match_type = 'missing') = (wardrobe_item_id IS NULL))
);

CREATE TABLE public.outfit_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  look_id uuid NOT NULL,
  option_type text NOT NULL CHECK (option_type IN ('closest', 'from_wardrobe', 'fresh_alternative')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  concept text NOT NULL DEFAULT '' CHECK (length(concept) <= 1000),
  rationale text NOT NULL DEFAULT '' CHECK (length(rationale) <= 4000),
  explanation jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(explanation) = 'object' AND octet_length(explanation::text) <= 32768),
  inputs_used jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(inputs_used) = 'object' AND octet_length(inputs_used::text) <= 16384),
  uncertainty jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(uncertainty) = 'array' AND octet_length(uncertainty::text) <= 8192),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'unavailable')),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_type text NOT NULL DEFAULT 'live' CHECK (source_type IN ('manual', 'live', 'sample')),
  provider_metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provider_metadata) = 'object' AND octet_length(provider_metadata::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, look_id, id),
  UNIQUE (workspace_id, look_id, option_type),
  FOREIGN KEY (workspace_id, look_id) REFERENCES public.looks(workspace_id, id)
);

ALTER TABLE public.looks ADD CONSTRAINT looks_selected_option_parent_fk
  FOREIGN KEY (workspace_id, id, selected_option_id) REFERENCES public.outfit_options(workspace_id, look_id, id);

CREATE TABLE public.outfit_option_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  look_id uuid NOT NULL,
  option_id uuid NOT NULL,
  slot_id text NOT NULL CHECK (length(btrim(slot_id)) BETWEEN 1 AND 80),
  category text NOT NULL CHECK (category IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  item_kind text NOT NULL CHECK (item_kind IN ('owned', 'product', 'missing')),
  piece_id uuid,
  wardrobe_item_id uuid,
  product_id uuid,
  missing_brief jsonb CHECK (missing_brief IS NULL OR (jsonb_typeof(missing_brief) = 'object' AND missing_brief <> '{}'::jsonb AND octet_length(missing_brief::text) <= 16384)),
  requested_brief text CHECK (length(requested_brief) BETWEEN 1 AND 1000),
  requested_category text CHECK (requested_category IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  rationale text NOT NULL DEFAULT '' CHECK (length(rationale) <= 4000),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  candidate_position integer NOT NULL DEFAULT 0 CHECK (candidate_position >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, look_id, option_id, slot_id, id),
  UNIQUE (workspace_id, option_id, slot_id, candidate_position),
  FOREIGN KEY (workspace_id, look_id, option_id) REFERENCES public.outfit_options(workspace_id, look_id, id),
  FOREIGN KEY (workspace_id, look_id, piece_id) REFERENCES public.inspiration_pieces(workspace_id, look_id, id),
  FOREIGN KEY (workspace_id, wardrobe_item_id, category) REFERENCES public.wardrobe_items(workspace_id, id, category),
  FOREIGN KEY (workspace_id, product_id, category) REFERENCES public.products(workspace_id, id, category),
  CHECK ((item_kind = 'owned' AND wardrobe_item_id IS NOT NULL AND product_id IS NULL AND missing_brief IS NULL)
    OR (item_kind = 'product' AND product_id IS NOT NULL AND wardrobe_item_id IS NULL AND missing_brief IS NULL)
    OR (item_kind = 'missing' AND wardrobe_item_id IS NULL AND product_id IS NULL AND missing_brief IS NOT NULL))
);

CREATE TABLE public.shopping_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  look_id uuid NOT NULL,
  option_id uuid NOT NULL,
  option_item_id uuid NOT NULL,
  slot_id text NOT NULL,
  option_revision integer NOT NULL CHECK (option_revision > 0),
  query text NOT NULL CHECK (length(btrim(query)) BETWEEN 2 AND 240),
  provider text NOT NULL CHECK (length(btrim(provider)) BETWEEN 1 AND 80),
  country text NOT NULL DEFAULT 'id' CHECK (country ~ '^[a-z]{2}$'),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'empty', 'failed', 'unavailable')),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  score_weights jsonb NOT NULL DEFAULT '{"price":0.3,"rating":0.2,"relevance":0.5}' CHECK (jsonb_typeof(score_weights) = 'object' AND octet_length(score_weights::text) <= 1024),
  score_version text NOT NULL DEFAULT 'v1' CHECK (length(score_version) BETWEEN 1 AND 80),
  error_code text CHECK (length(error_code) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, look_id, option_id, slot_id, option_item_id) REFERENCES public.outfit_option_items(workspace_id, look_id, option_id, slot_id, id)
);

CREATE TABLE public.shopping_results (
  workspace_id uuid NOT NULL,
  search_id uuid NOT NULL,
  product_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  factors jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(factors) = 'object' AND octet_length(factors::text) <= 8192),
  value_score numeric CHECK (value_score BETWEEN 0 AND 1),
  explanation text NOT NULL DEFAULT '' CHECK (length(explanation) <= 4000),
  score_version text NOT NULL DEFAULT 'v1' CHECK (length(score_version) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, search_id, product_id),
  UNIQUE (workspace_id, search_id, position),
  FOREIGN KEY (workspace_id, search_id) REFERENCES public.shopping_searches(workspace_id, id),
  FOREIGN KEY (workspace_id, product_id) REFERENCES public.products(workspace_id, id)
);

CREATE TABLE public.look_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  look_id uuid NOT NULL,
  option_id uuid NOT NULL,
  source_option_revision integer NOT NULL CHECK (source_option_revision > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, look_id, option_id),
  UNIQUE (workspace_id, id, look_id, option_id),
  FOREIGN KEY (workspace_id, look_id, option_id) REFERENCES public.outfit_options(workspace_id, look_id, id)
);

CREATE TABLE public.look_selection_items (
  workspace_id uuid NOT NULL,
  selection_id uuid NOT NULL,
  look_id uuid NOT NULL,
  option_id uuid NOT NULL,
  slot_id text NOT NULL,
  option_item_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, selection_id, slot_id),
  FOREIGN KEY (workspace_id, selection_id, look_id, option_id) REFERENCES public.look_selections(workspace_id, id, look_id, option_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, look_id, option_id, slot_id, option_item_id) REFERENCES public.outfit_option_items(workspace_id, look_id, option_id, slot_id, id)
);

CREATE TABLE public.saved_look_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  look_id uuid,
  option_id uuid,
  source_kind text NOT NULL DEFAULT 'look' CHECK (source_kind IN ('look', 'preview', 'capsule')),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  selection_revision integer CHECK (selection_revision > 0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 20 AND octet_length(items::text) <= 2097152),
  rationale text NOT NULL DEFAULT '' CHECK (length(rationale) <= 4000),
  inputs_used jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(inputs_used) = 'object' AND octet_length(inputs_used::text) <= 16384),
  uncertainty jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(uncertainty) = 'array' AND octet_length(uncertainty::text) <= 8192),
  preference_snapshot jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(preference_snapshot) = 'object' AND octet_length(preference_snapshot::text) <= 65536),
  spend_minor bigint CHECK (spend_minor >= 0),
  spend_currency text CHECK (spend_currency ~ '^[A-Z]{3}$'),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'live', 'sample')),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, look_id) REFERENCES public.looks(workspace_id, id),
  FOREIGN KEY (workspace_id, look_id, option_id) REFERENCES public.outfit_options(workspace_id, look_id, id),
  CHECK (option_id IS NULL OR look_id IS NOT NULL),
  CHECK (source_kind <> 'look' OR (look_id IS NOT NULL AND option_id IS NOT NULL))
);

CREATE TABLE public.capsules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  timeframe text CHECK (length(timeframe) <= 120),
  season text CHECK (length(season) <= 120),
  occasion text CHECK (length(occasion) <= 120),
  brief jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(brief) = 'object' AND octet_length(brief::text) <= 32768),
  missing_additions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(missing_additions) = 'array' AND jsonb_array_length(missing_additions) <= 3 AND octet_length(missing_additions::text) <= 65536),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE public.capsule_items (
  workspace_id uuid NOT NULL,
  capsule_id uuid NOT NULL,
  wardrobe_item_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, capsule_id, wardrobe_item_id),
  FOREIGN KEY (workspace_id, capsule_id) REFERENCES public.capsules(workspace_id, id),
  FOREIGN KEY (workspace_id, wardrobe_item_id) REFERENCES public.wardrobe_items(workspace_id, id)
);

CREATE TABLE public.capsule_outfits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  capsule_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  rationale text NOT NULL DEFAULT '' CHECK (length(rationale) <= 4000),
  explanation jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(explanation) = 'object' AND octet_length(explanation::text) <= 32768),
  inputs_used jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(inputs_used) = 'object' AND octet_length(inputs_used::text) <= 16384),
  uncertainty jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(uncertainty) = 'array' AND octet_length(uncertainty::text) <= 8192),
  proposed_slots jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(proposed_slots) = 'array' AND jsonb_array_length(proposed_slots) <= 20 AND octet_length(proposed_slots::text) <= 65536),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_type text NOT NULL DEFAULT 'live' CHECK (source_type IN ('manual', 'live', 'sample')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, capsule_id, id),
  FOREIGN KEY (workspace_id, capsule_id) REFERENCES public.capsules(workspace_id, id)
);

CREATE TABLE public.capsule_outfit_items (
  workspace_id uuid NOT NULL,
  capsule_id uuid NOT NULL,
  outfit_id uuid NOT NULL,
  wardrobe_item_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, outfit_id, wardrobe_item_id),
  UNIQUE (workspace_id, outfit_id, position),
  FOREIGN KEY (workspace_id, capsule_id, outfit_id) REFERENCES public.capsule_outfits(workspace_id, capsule_id, id),
  FOREIGN KEY (workspace_id, capsule_id, wardrobe_item_id) REFERENCES public.capsule_items(workspace_id, capsule_id, wardrobe_item_id)
);

CREATE TABLE public.workflow_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  feature_kind text NOT NULL CHECK (feature_kind IN ('inspiration', 'wardrobe', 'preferences', 'profile', 'capsules', 'preview', 'sharing')),
  look_id uuid,
  capsule_id uuid,
  asset_id uuid,
  current_step text CHECK (length(current_step) <= 80),
  visited_steps jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(visited_steps) = 'array' AND jsonb_array_length(visited_steps) <= 20 AND octet_length(visited_steps::text) <= 2048),
  payload jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 131072),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'discarded')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, look_id) REFERENCES public.looks(workspace_id, id),
  FOREIGN KEY (workspace_id, capsule_id) REFERENCES public.capsules(workspace_id, id),
  FOREIGN KEY (workspace_id, asset_id) REFERENCES public.assets(workspace_id, id)
);

CREATE TABLE public.workflow_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  kind text NOT NULL CHECK (kind IN ('inspiration_description', 'inspiration_confidence', 'wardrobe_match', 'outfit_options', 'option_regeneration', 'marketplace_search', 'wardrobe_description', 'capsule_generation', 'preview_image', 'saved_avatar')),
  subject_type text NOT NULL CHECK (subject_type IN ('look', 'outfit_option', 'option_item', 'capsule', 'draft', 'saved_look')),
  subject_id uuid NOT NULL,
  input_revision integer NOT NULL CHECK (input_revision > 0),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  input jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(input) = 'object' AND octet_length(input::text) <= 131072),
  prompt_version text CHECK (length(prompt_version) BETWEEN 1 AND 120),
  schema_version text CHECK (length(schema_version) BETWEEN 1 AND 120),
  model text CHECK (length(model) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'partial', 'succeeded', 'failed', 'cancelled', 'superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  lease_until timestamptz,
  provider_request_id text CHECK (length(provider_request_id) <= 512),
  result_ref jsonb CHECK (result_ref IS NULL OR (jsonb_typeof(result_ref) = 'object' AND octet_length(result_ref::text) <= 16384)),
  safe_error_code text CHECK (length(safe_error_code) <= 120),
  cancel_requested_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, kind, subject_type, subject_id, input_fingerprint),
  CHECK ((status IN ('running', 'partial')) = (lease_until IS NOT NULL)),
  CHECK ((status IN ('succeeded', 'failed', 'cancelled', 'superseded')) = (completed_at IS NOT NULL))
);

CREATE TABLE public.workflow_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  event_type text NOT NULL CHECK (event_type IN ('started', 'piece_completed', 'confidence_completed', 'completed', 'failed', 'superseded', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 131072),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, operation_id, sequence),
  FOREIGN KEY (workspace_id, operation_id) REFERENCES public.workflow_operations(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE public.saved_look_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  saved_look_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  preference_snapshot_hash text NOT NULL CHECK (preference_snapshot_hash ~ '^[a-f0-9]{64}$'),
  output_asset_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, saved_look_id, id),
  UNIQUE (workspace_id, operation_id),
  FOREIGN KEY (workspace_id, saved_look_id) REFERENCES public.saved_look_snapshots(workspace_id, id),
  FOREIGN KEY (workspace_id, operation_id) REFERENCES public.workflow_operations(workspace_id, id),
  FOREIGN KEY (workspace_id, output_asset_id) REFERENCES public.assets(workspace_id, id),
  CHECK (status <> 'succeeded' OR output_asset_id IS NOT NULL)
);

CREATE TABLE public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  saved_look_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  catchphrase text NOT NULL DEFAULT '' CHECK (length(catchphrase) <= 240),
  public_snapshot jsonb NOT NULL CHECK (jsonb_typeof(public_snapshot) = 'object' AND octet_length(public_snapshot::text) <= 65536 AND (public_snapshot - ARRAY['title', 'catchphrase', 'items']) = '{}'::jsonb),
  approved_media_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(approved_media_ids) <= 20 AND array_position(approved_media_ids, NULL) IS NULL),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, saved_look_id) REFERENCES public.saved_look_snapshots(workspace_id, id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '720 hours')
);

CREATE VIEW public.active_owned_wardrobe WITH (security_invoker = true) AS
  SELECT * FROM public.wardrobe_items WHERE inventory_status = 'owned' AND archived_at IS NULL;

CREATE FUNCTION public.stylora_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.stylora_require_owned_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.wardrobe_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wardrobe_items w
    WHERE w.workspace_id = NEW.workspace_id AND w.id = NEW.wardrobe_item_id
      AND w.inventory_status = 'owned' AND w.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ITEM_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wardrobe_matches_owned_guard BEFORE INSERT OR UPDATE ON public.wardrobe_matches
FOR EACH ROW EXECUTE FUNCTION public.stylora_require_owned_item();
CREATE TRIGGER capsule_items_owned_guard BEFORE INSERT OR UPDATE ON public.capsule_items
FOR EACH ROW EXECUTE FUNCTION public.stylora_require_owned_item();
CREATE TRIGGER capsule_outfit_items_owned_guard BEFORE INSERT OR UPDATE ON public.capsule_outfit_items
FOR EACH ROW EXECUTE FUNCTION public.stylora_require_owned_item();

CREATE FUNCTION public.stylora_guard_option_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_type text;
BEGIN
  SELECT o.option_type INTO v_type FROM public.outfit_options o
    WHERE o.workspace_id = NEW.workspace_id AND o.look_id = NEW.look_id AND o.id = NEW.option_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STYLORA_OPTION_PARENT_NOT_FOUND';
  END IF;
  IF v_type = 'from_wardrobe' AND NEW.item_kind <> 'owned' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ONLY_OPTION';
  END IF;
  IF NEW.item_kind = 'owned' AND NOT EXISTS (
    SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id = NEW.workspace_id
      AND w.id = NEW.wardrobe_item_id AND w.inventory_status = 'owned' AND w.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ITEM_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.outfit_option_items i WHERE i.workspace_id = NEW.workspace_id
    AND i.option_id = NEW.option_id AND i.slot_id = NEW.slot_id AND i.id <> NEW.id
    AND (i.category <> NEW.category OR i.position <> NEW.position)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SLOT_CONTRACT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outfit_option_items_guard BEFORE INSERT OR UPDATE ON public.outfit_option_items
FOR EACH ROW EXECUTE FUNCTION public.stylora_guard_option_item();

CREATE FUNCTION public.stylora_guard_saved_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SAVED_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER saved_look_snapshots_immutable BEFORE UPDATE ON public.saved_look_snapshots
FOR EACH ROW EXECUTE FUNCTION public.stylora_guard_saved_snapshot();

CREATE FUNCTION public.stylora_subject_revision(p_workspace_id uuid, p_subject_type text, p_subject_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_revision integer;
BEGIN
  CASE p_subject_type
    WHEN 'look' THEN SELECT x.revision INTO v_revision FROM public.looks x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id;
    WHEN 'outfit_option' THEN SELECT x.revision INTO v_revision FROM public.outfit_options x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id;
    WHEN 'option_item' THEN SELECT o.revision INTO v_revision FROM public.outfit_option_items x JOIN public.outfit_options o ON o.workspace_id = x.workspace_id AND o.id = x.option_id AND o.look_id = x.look_id WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id;
    WHEN 'capsule' THEN SELECT x.revision INTO v_revision FROM public.capsules x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id;
    WHEN 'draft' THEN SELECT x.revision INTO v_revision FROM public.workflow_drafts x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id AND x.status = 'active';
    WHEN 'saved_look' THEN SELECT x.source_revision INTO v_revision FROM public.saved_look_snapshots x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id;
    ELSE RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SUBJECT_TYPE_INVALID';
  END CASE;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SUBJECT_NOT_FOUND';
  END IF;
  RETURN v_revision;
END;
$$;

CREATE FUNCTION public.stylora_guard_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT ((NEW.kind IN ('inspiration_description', 'inspiration_confidence', 'wardrobe_match', 'outfit_options') AND NEW.subject_type = 'look')
    OR (NEW.kind = 'option_regeneration' AND NEW.subject_type = 'outfit_option')
    OR (NEW.kind = 'marketplace_search' AND NEW.subject_type = 'option_item')
    OR (NEW.kind IN ('wardrobe_description', 'preview_image') AND NEW.subject_type = 'draft')
    OR (NEW.kind = 'capsule_generation' AND NEW.subject_type = 'capsule')
    OR (NEW.kind = 'saved_avatar' AND NEW.subject_type = 'saved_look')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_SUBJECT_MISMATCH';
  END IF;
  PERFORM public.stylora_subject_revision(NEW.workspace_id, NEW.subject_type, NEW.subject_id);
  IF TG_OP = 'UPDATE' AND (NEW.workspace_id, NEW.kind, NEW.subject_type, NEW.subject_id, NEW.input_revision, NEW.input_fingerprint, NEW.input)
    IS DISTINCT FROM (OLD.workspace_id, OLD.kind, OLD.subject_type, OLD.subject_id, OLD.input_revision, OLD.input_fingerprint, OLD.input) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_INPUT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workflow_operations_subject_guard BEFORE INSERT OR UPDATE ON public.workflow_operations
FOR EACH ROW EXECUTE FUNCTION public.stylora_guard_operation();

CREATE FUNCTION public.stylora_guard_saved_media() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workflow_operations o
    WHERE o.workspace_id = NEW.workspace_id AND o.id = NEW.operation_id
      AND o.kind = 'saved_avatar' AND o.subject_type = 'saved_look' AND o.subject_id = NEW.saved_look_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_MEDIA_OPERATION_MISMATCH';
  END IF;
  IF NEW.output_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.assets a
    WHERE a.workspace_id = NEW.workspace_id AND a.id = NEW.output_asset_id AND a.bucket = 'previews' AND a.status = 'ready') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_MEDIA_ASSET_NOT_READY';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER saved_look_media_guard BEFORE INSERT OR UPDATE ON public.saved_look_media
FOR EACH ROW EXECUTE FUNCTION public.stylora_guard_saved_media();

CREATE FUNCTION public.stylora_guard_share_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_item jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND ((NEW.id, NEW.workspace_id, NEW.saved_look_id, NEW.token_hash, NEW.catchphrase, NEW.public_snapshot, NEW.approved_media_ids, NEW.expires_at, NEW.created_at)
    IS DISTINCT FROM (OLD.id, OLD.workspace_id, OLD.saved_look_id, OLD.token_hash, OLD.catchphrase, OLD.public_snapshot, OLD.approved_media_ids, OLD.expires_at, OLD.created_at)
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SHARE_PUBLICATION_IMMUTABLE';
  END IF;
  IF jsonb_typeof(NEW.public_snapshot->'title') IS DISTINCT FROM 'string'
    OR length(NEW.public_snapshot->>'title') NOT BETWEEN 1 AND 160
    OR (NEW.public_snapshot ? 'catchphrase' AND (jsonb_typeof(NEW.public_snapshot->'catchphrase') IS DISTINCT FROM 'string' OR NEW.public_snapshot->>'catchphrase' <> NEW.catchphrase))
    OR jsonb_typeof(NEW.public_snapshot->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_SNAPSHOT_INVALID';
  END IF;
  IF jsonb_array_length(NEW.public_snapshot->'items') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_ITEMS_INVALID';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.public_snapshot->'items') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR (v_item - ARRAY['name', 'category', 'colors']) <> '{}'::jsonb
      OR jsonb_typeof(v_item->'name') IS DISTINCT FROM 'string' OR length(v_item->>'name') NOT BETWEEN 1 AND 160
      OR (v_item->>'category') IS NULL OR (v_item->>'category') NOT IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')
      OR (v_item ? 'colors' AND jsonb_typeof(v_item->'colors') IS DISTINCT FROM 'array') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_ITEM_INVALID';
    END IF;
    IF v_item ? 'colors' THEN
      IF jsonb_array_length(v_item->'colors') > 5 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_item->'colors') c(value)
        WHERE jsonb_typeof(c.value) <> 'string' OR length(c.value #>> '{}') NOT BETWEEN 1 AND 80
      ) THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_COLORS_INVALID'; END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(NEW.approved_media_ids) AS ids(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.saved_look_media m JOIN public.assets a
      ON a.workspace_id = m.workspace_id AND a.id = m.output_asset_id
      WHERE m.workspace_id = NEW.workspace_id AND m.saved_look_id = NEW.saved_look_id AND m.id = ids.id
        AND m.status = 'succeeded' AND a.status = 'ready' AND a.bucket = 'previews')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SHARE_MEDIA_NOT_APPROVED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER share_links_guard BEFORE INSERT OR UPDATE ON public.share_links
FOR EACH ROW EXECUTE FUNCTION public.stylora_guard_share_link();

CREATE FUNCTION public.save_look_selection(
  p_workspace_id uuid, p_look_id uuid, p_option_id uuid, p_expected_revision integer, p_choices jsonb
) RETURNS public.look_selections LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_look public.looks; v_option public.outfit_options; v_selection public.look_selections; v_slot_count integer; v_choice_count integer;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 0 OR jsonb_typeof(p_choices) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SELECTION_INPUT_INVALID';
  END IF;
  IF jsonb_array_length(p_choices) NOT BETWEEN 1 AND 20 OR octet_length(p_choices::text) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SELECTION_INPUT_INVALID';
  END IF;
  SELECT * INTO v_look FROM public.looks WHERE workspace_id = p_workspace_id AND id = p_look_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_LOOK_NOT_FOUND'; END IF;
  SELECT * INTO v_option FROM public.outfit_options WHERE workspace_id = p_workspace_id AND look_id = p_look_id AND id = p_option_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPTION_NOT_FOUND'; END IF;
  IF v_option.status <> 'ready' OR v_option.source_revision <> v_look.revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPTION_STALE';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_choices) c(value)
    WHERE jsonb_typeof(c.value) <> 'object' OR (c.value - ARRAY['slot_id', 'option_item_id']) <> '{}'::jsonb
      OR jsonb_typeof(c.value->'slot_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(c.value->'option_item_id') IS DISTINCT FROM 'string'
      OR NOT pg_input_is_valid(c.value->>'option_item_id', 'uuid')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SELECTION_CHOICE_INVALID';
  END IF;
  SELECT count(DISTINCT slot_id) INTO v_slot_count FROM public.outfit_option_items
    WHERE workspace_id = p_workspace_id AND look_id = p_look_id AND option_id = p_option_id;
  SELECT count(DISTINCT c.value->>'slot_id') INTO v_choice_count FROM jsonb_array_elements(p_choices) c(value);
  IF v_slot_count <> jsonb_array_length(p_choices) OR v_choice_count <> v_slot_count OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_choices) c(value)
    LEFT JOIN public.outfit_option_items i ON i.workspace_id = p_workspace_id AND i.look_id = p_look_id
      AND i.option_id = p_option_id AND i.slot_id = c.value->>'slot_id' AND i.id = (c.value->>'option_item_id')::uuid
    LEFT JOIN public.wardrobe_items w ON w.workspace_id = i.workspace_id AND w.id = i.wardrobe_item_id
    WHERE i.id IS NULL OR (i.item_kind = 'owned' AND (w.inventory_status <> 'owned' OR w.archived_at IS NOT NULL))
  ) THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SELECTION_COMPOSITION_INVALID'; END IF;
  SELECT * INTO v_selection FROM public.look_selections WHERE workspace_id = p_workspace_id AND look_id = p_look_id AND option_id = p_option_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_revision <> v_selection.revision THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_SELECTION_REVISION_CONFLICT'; END IF;
    UPDATE public.look_selections SET revision = revision + 1, source_option_revision = v_option.revision
      WHERE workspace_id = p_workspace_id AND id = v_selection.id RETURNING * INTO v_selection;
    DELETE FROM public.look_selection_items WHERE workspace_id = p_workspace_id AND selection_id = v_selection.id;
  ELSE
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_SELECTION_REVISION_CONFLICT'; END IF;
    INSERT INTO public.look_selections(workspace_id, look_id, option_id, source_option_revision)
      VALUES (p_workspace_id, p_look_id, p_option_id, v_option.revision) RETURNING * INTO v_selection;
  END IF;
  INSERT INTO public.look_selection_items(workspace_id, selection_id, look_id, option_id, slot_id, option_item_id)
    SELECT p_workspace_id, v_selection.id, p_look_id, p_option_id, c.value->>'slot_id', (c.value->>'option_item_id')::uuid FROM jsonb_array_elements(p_choices) c(value);
  UPDATE public.looks SET selected_option_id = p_option_id WHERE workspace_id = p_workspace_id AND id = p_look_id;
  RETURN v_selection;
END;
$$;

CREATE FUNCTION public.start_workflow_operation(
  p_workspace_id uuid, p_kind text, p_subject_type text, p_subject_id uuid,
  p_input_revision integer, p_input_fingerprint text, p_input jsonb DEFAULT '{}',
  p_prompt_version text DEFAULT NULL, p_schema_version text DEFAULT NULL, p_model text DEFAULT NULL
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_revision integer;
BEGIN
  v_revision := public.stylora_subject_revision(p_workspace_id, p_subject_type, p_subject_id);
  IF p_input_revision IS NULL OR p_input_revision <> v_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  INSERT INTO public.workflow_operations(workspace_id, kind, subject_type, subject_id, input_revision, input_fingerprint, input, prompt_version, schema_version, model)
    VALUES (p_workspace_id, p_kind, p_subject_type, p_subject_id, p_input_revision, p_input_fingerprint, p_input, p_prompt_version, p_schema_version, p_model)
    ON CONFLICT (workspace_id, kind, subject_type, subject_id, input_fingerprint) DO NOTHING RETURNING * INTO v_operation;
  IF NOT FOUND THEN
    SELECT * INTO STRICT v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND kind = p_kind
      AND subject_type = p_subject_type AND subject_id = p_subject_id AND input_fingerprint = p_input_fingerprint;
    IF (v_operation.input_revision, v_operation.input, v_operation.prompt_version, v_operation.schema_version, v_operation.model)
      IS DISTINCT FROM (p_input_revision, p_input, p_prompt_version, p_schema_version, p_model) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_FINGERPRINT_REUSED';
    END IF;
  END IF;
  RETURN v_operation;
END;
$$;

CREATE FUNCTION public.claim_workflow_operation(
  p_workspace_id uuid, p_operation_id uuid, p_input_revision integer, p_lease_seconds integer DEFAULT 120
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_revision integer;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_LEASE_INVALID';
  END IF;
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_input_revision IS NULL OR p_input_revision <> v_operation.input_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  IF v_operation.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN v_operation; END IF;
  v_revision := public.stylora_subject_revision(p_workspace_id, v_operation.subject_type, v_operation.subject_id);
  IF v_revision <> v_operation.input_revision THEN
    UPDATE public.workflow_operations SET status = 'superseded', lease_until = NULL, completed_at = clock_timestamp(), safe_error_code = 'INPUT_SUPERSEDED'
      WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
    RETURN v_operation;
  END IF;
  IF v_operation.cancel_requested_at IS NOT NULL THEN
    UPDATE public.workflow_operations SET status = 'cancelled', lease_until = NULL, completed_at = clock_timestamp()
      WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
    RETURN v_operation;
  END IF;
  IF v_operation.lease_until > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_OPERATION_ALREADY_CLAIMED';
  END IF;
  IF v_operation.attempt_count >= 3 THEN
    UPDATE public.workflow_operations SET status = 'failed', lease_until = NULL, completed_at = clock_timestamp(), safe_error_code = 'RETRY_BUDGET_EXHAUSTED'
      WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
    RETURN v_operation;
  END IF;
  UPDATE public.workflow_operations SET status = 'running', attempt_count = attempt_count + 1,
    lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds)
    WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
  RETURN v_operation;
END;
$$;

CREATE FUNCTION public.save_look_snapshot(
  p_workspace_id uuid, p_look_id uuid, p_option_id uuid, p_expected_revision integer, p_idempotency_key text, p_title text
) RETURNS public.saved_look_snapshots LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_saved public.saved_look_snapshots; v_look public.looks; v_option public.outfit_options;
  v_selection public.look_selections; v_items jsonb; v_preferences jsonb; v_hash text;
  v_operation public.workflow_operations; v_slots integer; v_selected integer; v_spend bigint; v_currency text;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1 OR p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SAVE_INPUT_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':save:' || p_idempotency_key, 0));
  SELECT * INTO v_saved FROM public.saved_look_snapshots WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF (v_saved.look_id, v_saved.option_id, v_saved.selection_revision, v_saved.title)
      IS DISTINCT FROM (p_look_id, p_option_id, p_expected_revision, btrim(p_title)) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SAVE_IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN v_saved;
  END IF;
  SELECT * INTO v_look FROM public.looks WHERE workspace_id = p_workspace_id AND id = p_look_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_LOOK_NOT_FOUND'; END IF;
  SELECT * INTO v_option FROM public.outfit_options WHERE workspace_id = p_workspace_id AND look_id = p_look_id AND id = p_option_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPTION_NOT_FOUND'; END IF;
  SELECT * INTO v_selection FROM public.look_selections WHERE workspace_id = p_workspace_id AND look_id = p_look_id AND option_id = p_option_id FOR UPDATE;
  IF NOT FOUND OR v_selection.revision <> p_expected_revision OR v_selection.source_option_revision <> v_option.revision
    OR v_option.source_revision <> v_look.revision OR v_option.status <> 'ready' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_SAVE_REVISION_CONFLICT';
  END IF;
  PERFORM 1 FROM public.wardrobe_items w
    JOIN public.outfit_option_items i ON i.workspace_id = w.workspace_id AND i.wardrobe_item_id = w.id
    JOIN public.look_selection_items s ON s.workspace_id = i.workspace_id AND s.option_item_id = i.id
    WHERE s.workspace_id = p_workspace_id AND s.selection_id = v_selection.id ORDER BY w.id FOR SHARE OF w;
  PERFORM 1 FROM public.products p
    JOIN public.outfit_option_items i ON i.workspace_id = p.workspace_id AND i.product_id = p.id
    JOIN public.look_selection_items s ON s.workspace_id = i.workspace_id AND s.option_item_id = i.id
    WHERE s.workspace_id = p_workspace_id AND s.selection_id = v_selection.id ORDER BY p.id FOR SHARE OF p;
  SELECT count(DISTINCT slot_id) INTO v_slots FROM public.outfit_option_items WHERE workspace_id = p_workspace_id AND option_id = p_option_id AND look_id = p_look_id;
  SELECT count(*) INTO v_selected FROM public.look_selection_items WHERE workspace_id = p_workspace_id AND selection_id = v_selection.id;
  IF v_slots < 1 OR v_slots <> v_selected OR EXISTS (
    SELECT 1 FROM public.look_selection_items s JOIN public.outfit_option_items i ON i.workspace_id = s.workspace_id AND i.id = s.option_item_id
    LEFT JOIN public.wardrobe_items w ON w.workspace_id = i.workspace_id AND w.id = i.wardrobe_item_id
    WHERE s.workspace_id = p_workspace_id AND s.selection_id = v_selection.id
      AND i.item_kind = 'owned' AND (w.inventory_status <> 'owned' OR w.archived_at IS NOT NULL)
  ) THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SAVE_COMPOSITION_INVALID'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'schema_version', 'fashion-item.v1', 'id', coalesce(w.id, p.id), 'option_item_id', i.id, 'slot_id', i.slot_id,
    'name', coalesce(w.name, left(p.title, 160), i.missing_brief->>'name', i.requested_brief, 'Missing item'),
    'category', i.category, 'subcategory', coalesce(w.subcategory, p.subcategory, i.missing_brief->>'subcategory'),
    'description', coalesce(w.description, p.description, i.missing_brief->>'description', ''),
    'attributes', coalesce(w.attributes, p.attributes, i.missing_brief->'attributes', '{}'::jsonb),
    'provenance', coalesce(w.provenance, p.provenance, i.missing_brief->'provenance', '{}'::jsonb),
    'corrections', coalesce(w.corrections, p.corrections, '{}'::jsonb),
    'confidence', w.confidence,
    'uncertainty', coalesce(w.uncertainty, p.uncertainty, i.missing_brief->'uncertainty', '[]'::jsonb),
    'revision', coalesce(w.revision, p.revision, i.revision),
    'asset_id', w.asset_id, 'image_url', p.image_url, 'owned_at_save', i.item_kind = 'owned',
    'inventory_status', CASE WHEN i.item_kind = 'owned' THEN 'owned' ELSE 'not_applicable' END,
    'source_reference', jsonb_build_object('kind', CASE i.item_kind WHEN 'owned' THEN 'wardrobe' WHEN 'product' THEN 'product' ELSE 'missing_brief' END, 'id', coalesce(w.id, p.id)),
    'source_type', coalesce(w.source_type, p.source_type, v_option.source_type),
    'source_label', coalesce(p.source_label, CASE WHEN i.item_kind = 'owned' THEN 'Wardrobe' ELSE 'Missing item' END),
    'price_minor', p.price_minor, 'shipping_minor', p.shipping_minor, 'currency', p.currency
  ) ORDER BY i.position, i.slot_id) INTO v_items
  FROM public.look_selection_items s
  JOIN public.outfit_option_items i ON i.workspace_id = s.workspace_id AND i.look_id = s.look_id AND i.option_id = s.option_id AND i.slot_id = s.slot_id AND i.id = s.option_item_id
  LEFT JOIN public.wardrobe_items w ON w.workspace_id = i.workspace_id AND w.id = i.wardrobe_item_id
  LEFT JOIN public.products p ON p.workspace_id = i.workspace_id AND p.id = i.product_id
  WHERE s.workspace_id = p_workspace_id AND s.selection_id = v_selection.id;
  SELECT CASE WHEN bool_and(i.item_kind = 'owned' OR (i.item_kind = 'product' AND p.price_minor IS NOT NULL AND p.currency IS NOT NULL))
    AND count(DISTINCT p.currency) <= 1 THEN coalesce(sum(p.price_minor), 0)::bigint ELSE NULL END,
    CASE WHEN count(DISTINCT p.currency) = 1 THEN min(p.currency) ELSE NULL END
    INTO v_spend, v_currency
    FROM public.look_selection_items s JOIN public.outfit_option_items i ON i.workspace_id = s.workspace_id AND i.id = s.option_item_id
    LEFT JOIN public.products p ON p.workspace_id = i.workspace_id AND p.id = i.product_id
    WHERE s.workspace_id = p_workspace_id AND s.selection_id = v_selection.id;
  SELECT jsonb_build_object('revision', u.revision, 'style_dna', u.style_dna, 'fit_preferences', u.fit_preferences, 'body_profile', u.body_profile, 'style_notes', u.style_notes)
    INTO v_preferences FROM public.user_preferences u WHERE u.workspace_id = p_workspace_id FOR SHARE;
  v_preferences := coalesce(v_preferences, '{}'::jsonb);
  v_hash := encode(sha256(convert_to(v_preferences::text, 'UTF8')), 'hex');
  INSERT INTO public.saved_look_snapshots(workspace_id, look_id, option_id, source_revision, selection_revision, title, items, rationale, inputs_used, uncertainty, preference_snapshot, spend_minor, spend_currency, source_type, idempotency_key)
    VALUES (p_workspace_id, p_look_id, p_option_id, v_look.revision, v_selection.revision, btrim(p_title), v_items,
      v_option.rationale, v_option.inputs_used || '{"spend_basis":"product_prices_excluding_shipping"}'::jsonb, v_option.uncertainty,
      v_preferences, v_spend, CASE WHEN v_spend IS NULL THEN NULL ELSE v_currency END, v_option.source_type, p_idempotency_key)
    RETURNING * INTO v_saved;
  v_operation := public.start_workflow_operation(p_workspace_id, 'saved_avatar', 'saved_look', v_saved.id, v_saved.source_revision,
    encode(sha256(convert_to(v_saved.id::text || ':' || v_hash || ':stylora-fashion-v1:fashion-item.v1', 'UTF8')), 'hex'),
    jsonb_build_object('saved_look_id', v_saved.id, 'preference_snapshot_hash', v_hash), 'stylora-fashion-v1', 'fashion-item.v1', NULL);
  INSERT INTO public.saved_look_media(workspace_id, saved_look_id, operation_id, preference_snapshot_hash)
    VALUES (p_workspace_id, v_saved.id, v_operation.id, v_hash);
  RETURN v_saved;
END;
$$;

CREATE INDEX assets_workspace_status_created_idx ON public.assets(workspace_id, status, created_at DESC, id);
CREATE INDEX wardrobe_items_active_category_idx ON public.wardrobe_items(workspace_id, inventory_status, category, created_at DESC, id) WHERE archived_at IS NULL;
CREATE INDEX wardrobe_items_asset_idx ON public.wardrobe_items(workspace_id, asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX wardrobe_items_product_idx ON public.wardrobe_items(workspace_id, source_product_id) WHERE source_product_id IS NOT NULL;
CREATE INDEX looks_workspace_updated_idx ON public.looks(workspace_id, updated_at DESC, id);
CREATE INDEX looks_asset_idx ON public.looks(workspace_id, inspiration_asset_id) WHERE inspiration_asset_id IS NOT NULL;
CREATE INDEX looks_selected_option_idx ON public.looks(workspace_id, id, selected_option_id) WHERE selected_option_id IS NOT NULL;
CREATE INDEX inspiration_pieces_look_position_idx ON public.inspiration_pieces(workspace_id, look_id, position, id) WHERE removed_at IS NULL;
CREATE INDEX look_reviews_revision_idx ON public.look_reviews(workspace_id, look_id, source_revision, created_at DESC);
CREATE INDEX wardrobe_matches_piece_idx ON public.wardrobe_matches(workspace_id, look_id, piece_id, source_revision);
CREATE INDEX wardrobe_matches_wardrobe_idx ON public.wardrobe_matches(workspace_id, wardrobe_item_id) WHERE wardrobe_item_id IS NOT NULL;
CREATE INDEX outfit_option_items_slot_idx ON public.outfit_option_items(workspace_id, option_id, position, slot_id, candidate_position);
CREATE INDEX outfit_option_items_piece_idx ON public.outfit_option_items(workspace_id, look_id, piece_id) WHERE piece_id IS NOT NULL;
CREATE INDEX outfit_option_items_wardrobe_idx ON public.outfit_option_items(workspace_id, wardrobe_item_id, category) WHERE wardrobe_item_id IS NOT NULL;
CREATE INDEX outfit_option_items_product_idx ON public.outfit_option_items(workspace_id, product_id, category) WHERE product_id IS NOT NULL;
CREATE INDEX shopping_searches_cache_idx ON public.shopping_searches(workspace_id, option_id, option_revision, slot_id, input_fingerprint, created_at DESC);
CREATE INDEX shopping_searches_item_idx ON public.shopping_searches(workspace_id, look_id, option_id, slot_id, option_item_id);
CREATE INDEX shopping_results_product_idx ON public.shopping_results(workspace_id, product_id);
CREATE INDEX look_selection_items_candidate_idx ON public.look_selection_items(workspace_id, look_id, option_id, slot_id, option_item_id);
CREATE INDEX saved_look_snapshots_created_idx ON public.saved_look_snapshots(workspace_id, created_at DESC, id);
CREATE INDEX saved_look_snapshots_source_idx ON public.saved_look_snapshots(workspace_id, look_id, option_id);
CREATE INDEX capsule_items_wardrobe_idx ON public.capsule_items(workspace_id, wardrobe_item_id);
CREATE INDEX capsules_updated_idx ON public.capsules(workspace_id, updated_at DESC, id);
CREATE INDEX capsule_outfit_items_capsule_idx ON public.capsule_outfit_items(workspace_id, capsule_id, outfit_id);
CREATE INDEX capsule_outfit_items_member_idx ON public.capsule_outfit_items(workspace_id, capsule_id, wardrobe_item_id);
CREATE INDEX workflow_drafts_updated_idx ON public.workflow_drafts(workspace_id, feature_kind, status, updated_at DESC, id);
CREATE INDEX workflow_drafts_look_idx ON public.workflow_drafts(workspace_id, look_id) WHERE look_id IS NOT NULL;
CREATE INDEX workflow_drafts_capsule_idx ON public.workflow_drafts(workspace_id, capsule_id) WHERE capsule_id IS NOT NULL;
CREATE INDEX workflow_drafts_asset_idx ON public.workflow_drafts(workspace_id, asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX workflow_operations_poll_idx ON public.workflow_operations(workspace_id, status, lease_until, created_at);
CREATE INDEX saved_look_media_asset_idx ON public.saved_look_media(workspace_id, output_asset_id) WHERE output_asset_id IS NOT NULL;
CREATE INDEX share_links_saved_idx ON public.share_links(workspace_id, saved_look_id, created_at DESC);
CREATE INDEX share_links_active_idx ON public.share_links(workspace_id, expires_at) WHERE revoked_at IS NULL;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['workspaces', 'assets', 'user_preferences', 'products', 'wardrobe_items', 'looks', 'inspiration_pieces',
    'look_reviews', 'wardrobe_matches', 'outfit_options', 'outfit_option_items', 'shopping_searches', 'shopping_results',
    'look_selections', 'look_selection_items', 'saved_look_snapshots', 'capsules', 'capsule_items', 'capsule_outfits',
    'capsule_outfit_items', 'workflow_drafts', 'workflow_operations', 'workflow_operation_events', 'saved_look_media', 'share_links'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', v_table);
    IF v_table = 'saved_look_snapshots' OR v_table = 'workflow_operation_events' THEN
      EXECUTE format('GRANT SELECT, INSERT, DELETE ON TABLE public.%I TO service_role', v_table);
    ELSIF v_table = 'workspaces' THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO service_role', v_table);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', v_table);
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['workspaces', 'assets', 'user_preferences', 'products', 'wardrobe_items', 'looks', 'inspiration_pieces',
    'outfit_options', 'outfit_option_items', 'shopping_searches', 'look_selections', 'capsules', 'workflow_drafts', 'workflow_operations', 'saved_look_media'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stylora_touch_updated_at()', v_table || '_touch_updated_at', v_table);
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.active_owned_wardrobe FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.active_owned_wardrobe TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

REVOKE ALL ON FUNCTION public.stylora_touch_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stylora_require_owned_item() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stylora_guard_option_item() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stylora_guard_saved_snapshot() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stylora_subject_revision(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stylora_guard_operation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stylora_guard_saved_media() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stylora_guard_share_link() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_look_selection(uuid, uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_workflow_operation(uuid, text, text, uuid, integer, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_workflow_operation(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_look_snapshot(uuid, uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stylora_subject_revision(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_look_selection(uuid, uuid, uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_workflow_operation(uuid, text, text, uuid, integer, text, jsonb, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_workflow_operation(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_look_snapshot(uuid, uuid, uuid, integer, text, text) TO service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('inspiration', 'inspiration', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('wardrobe', 'wardrobe', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('previews', 'previews', false, 10485760, array['image/png']);
