-- GH-481 (D0238): an approved kiosk terminal payment is published to ROLLER together with
-- its payment. kiosk_installation_id records the capability-verified installation that created
-- a card-present draft; terminal_transaction_ref keeps the first transaction id (the Adyen PSP
-- reference) reported with its approval. Neither is a credential, card data or contact data.
ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD COLUMN IF NOT EXISTS kiosk_installation_id text,
  ADD COLUMN IF NOT EXISTS terminal_transaction_ref text;

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_kiosk_installation_id_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_kiosk_installation_id_check CHECK (
    kiosk_installation_id IS NULL
    OR (payment_channel = 'card_present' AND kiosk_installation_id ~ '^ki_[a-f0-9]{24}$')
  );

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_terminal_transaction_ref_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_terminal_transaction_ref_check CHECK (
    terminal_transaction_ref IS NULL
    OR (
      payment_channel = 'card_present'
      AND kiosk_installation_id IS NOT NULL
      AND terminal_transaction_ref ~ '^[A-Za-z0-9]{8,64}$'
    )
  );
