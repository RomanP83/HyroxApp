-- ============================================================================
-- 0027 — benchmarks can be scored in watts.
--
-- The AT-PT trial (0028) scores the average power held at a fixed heart rate.
-- None of time, reps or metres says that.
--
-- Note for an EXISTING database: this only adds the enum value, on its own,
-- because a new enum value may not be USED in the transaction that adds it —
-- 0028 is the first to use it. A fresh install gets the value from 0001.
-- ============================================================================

alter type benchmark_metric_t add value if not exists 'watts';
