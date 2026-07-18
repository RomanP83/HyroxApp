-- Post-session training feedback (fulfillment index, IST-SOLL metrics, coach
-- text). Computed by the engine at log time and cached here so the card can be
-- re-shown without recomputation.
alter table session_logs add column if not exists feedback jsonb;
