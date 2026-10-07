-- GH-481 (D0238): the Adyen merchant account (PaymentAcquirerData.MerchantID) reported with an
-- approved kiosk terminal payment. ROLLER needs it as `MerchantId` in the published payment to link
-- that payment to its gateway transaction, so the booking can be refunded through the gateway.
-- It is neither a credential, card data nor contact data.
ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD COLUMN IF NOT EXISTS terminal_merchant_id text;

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_terminal_merchant_id_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_terminal_merchant_id_check CHECK (
    terminal_merchant_id IS NULL
    OR (
      payment_channel = 'card_present'
      AND kiosk_installation_id IS NOT NULL
      AND terminal_merchant_id ~ '^[A-Za-z0-9_.-]{1,80}$'
    )
  );
