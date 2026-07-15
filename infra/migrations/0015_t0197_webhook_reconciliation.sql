-- T0197: the authoritative webhook snapshot may remove booking items or tickets
-- that were present in an older Aurora snapshot. The webhook runtime receives
-- DELETE only on those two child tables; booking, contact, audit, payment, and
-- lifecycle deletion privileges remain unchanged.

GRANT DELETE ON
  jumpyard.roller_booking_tickets,
  jumpyard.roller_booking_items
TO jumpyard_webhook_runtime;
