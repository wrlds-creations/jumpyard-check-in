ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD COLUMN IF NOT EXISTS customer_first_name text,
  ADD COLUMN IF NOT EXISTS customer_last_name text;

WITH matched_profile AS (
  SELECT DISTINCT ON (draft.prepayment_draft_id)
    draft.prepayment_draft_id,
    NULLIF(profile.latest_booking_context ->> 'firstName', '') AS first_name,
    NULLIF(profile.latest_booking_context ->> 'lastName', '') AS last_name
  FROM jumpyard.prepayment_booking_drafts AS draft
  INNER JOIN jumpyard.guest_profiles AS profile
    ON (
      draft.customer_email_hash IS NOT NULL
      AND profile.email_hash = draft.customer_email_hash
    )
    OR (
      draft.customer_phone_hash IS NOT NULL
      AND profile.contact_number_hash = draft.customer_phone_hash
    )
  WHERE draft.customer_first_name IS NULL
     OR draft.customer_last_name IS NULL
  ORDER BY draft.prepayment_draft_id, profile.updated_at DESC NULLS LAST
)
UPDATE jumpyard.prepayment_booking_drafts AS draft
SET
  customer_first_name = COALESCE(NULLIF(draft.customer_first_name, ''), matched_profile.first_name),
  customer_last_name = COALESCE(NULLIF(draft.customer_last_name, ''), matched_profile.last_name),
  updated_at = now()
FROM matched_profile
WHERE draft.prepayment_draft_id = matched_profile.prepayment_draft_id
  AND (
    matched_profile.first_name IS NOT NULL
    OR matched_profile.last_name IS NOT NULL
  );
