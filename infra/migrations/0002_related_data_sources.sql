ALTER TABLE jumpyard.roller_booking_tickets
  ADD COLUMN IF NOT EXISTS roller_customer_id text,
  ADD COLUMN IF NOT EXISTS custom_ticket_id text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS booking_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS ticket_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS roller_booking_tickets_customer_id_idx ON jumpyard.roller_booking_tickets (roller_customer_id);
CREATE INDEX IF NOT EXISTS roller_booking_tickets_product_id_idx ON jumpyard.roller_booking_tickets (product_id);
CREATE INDEX IF NOT EXISTS roller_booking_tickets_booking_date_idx ON jumpyard.roller_booking_tickets (booking_date);

ALTER TABLE jumpyard.guest_profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS contact_source text;

CREATE INDEX IF NOT EXISTS guest_profiles_email_lower_idx ON jumpyard.guest_profiles (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS guest_profiles_contact_number_idx ON jumpyard.guest_profiles (contact_number) WHERE contact_number IS NOT NULL;
