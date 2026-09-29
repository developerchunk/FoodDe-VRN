-- The WhatsApp webhook finds a row by the id Meta gave us, not by order.
--
-- Every status callback -- sent, delivered, read, failed -- arrives as an
-- update keyed on provider_message_id. message_log only had an index on
-- order_id, so each callback was a sequential scan, and one order produces
-- several messages each producing several callbacks.
--
-- Partial, because a queued row has no provider id yet and there is no reason
-- to index the nulls.
create index if not exists message_log_provider_idx
  on public.message_log (provider_message_id)
  where provider_message_id is not null;

-- Phase 5 needs to find what still has not been delivered, which is a scan over
-- status until it is indexed.
create index if not exists message_log_status_idx
  on public.message_log (status);
