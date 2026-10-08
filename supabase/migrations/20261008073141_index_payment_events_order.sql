-- Cover payment-event order lookups and FK checks without changing access.
create index if not exists payment_events_order_idx on private.payment_events(order_id);
