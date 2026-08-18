-- GH-249: the booking runtime creates a fail-closed provisional booking/session
-- only after a server-verified card-present approval, then replaces that context
-- with the authoritative ROLLER booking and tickets during reconciliation.
GRANT SELECT, INSERT, UPDATE ON
  jumpyard.roller_bookings,
  jumpyard.roller_booking_items,
  jumpyard.roller_booking_tickets,
  jumpyard.checkin_sessions,
  jumpyard.checkin_tokens
TO jumpyard_booking_runtime;
