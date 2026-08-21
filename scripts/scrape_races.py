#!/usr/bin/env python3
"""
Hyrox event-calendar scraper (Implementation Plan §4, Roadmap B5).

Scrapes ONLY the public event calendar — never training content (§7 copyright
rule) — and upserts into the `races` table via the Supabase REST API using the
service-role key. Run weekly (cron) or manually:

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... FIRECRAWL_API_KEY=... \
        python3 scripts/scrape_races.py

Requires: requests  (pip install requests)

Extraction uses Firecrawl's /v2/extract endpoint with a JSON schema, which is
robust against markup changes on the source page. Review the first run's
output before trusting it in production — event pages change.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date

import requests

SOURCE_URL = "https://hyrox.com/find-my-race/"

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "city": {"type": "string"},
                    "country": {"type": "string"},
                    "event_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD) of the race day",
                    },
                },
                "required": ["name", "event_date"],
            },
        }
    },
    "required": ["events"],
}


def firecrawl_extract(api_key: str) -> list[dict]:
    resp = requests.post(
        "https://api.firecrawl.dev/v2/extract",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "urls": [SOURCE_URL],
            "prompt": (
                "Extract every upcoming Hyrox race event with its name, city, "
                "country and race date. Dates as ISO YYYY-MM-DD."
            ),
            "schema": EXTRACT_SCHEMA,
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    events = (data.get("data") or {}).get("events") or []
    return events


def valid(event: dict) -> bool:
    try:
        d = date.fromisoformat(event["event_date"])
    except (KeyError, ValueError):
        return False
    return d >= date.today() and bool(event.get("name", "").strip())


def upsert_races(supabase_url: str, service_key: str, events: list[dict]) -> int:
    rows = [
        {
            "name": e["name"].strip(),
            "city": (e.get("city") or "").strip() or None,
            "country": (e.get("country") or "").strip() or None,
            "event_date": e["event_date"],
            "source_url": SOURCE_URL,
        }
        for e in events
        if valid(e)
    ]
    if not rows:
        return 0
    # Dedupe by (name, event_date) client-side; the table has no natural key.
    existing = requests.get(
        f"{supabase_url}/rest/v1/races",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        params={"select": "name,event_date"},
        timeout=60,
    )
    existing.raise_for_status()
    seen = {(r["name"], r["event_date"]) for r in existing.json()}
    fresh = [r for r in rows if (r["name"], r["event_date"]) not in seen]
    if not fresh:
        return 0
    resp = requests.post(
        f"{supabase_url}/rest/v1/races",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        data=json.dumps(fresh),
        timeout=60,
    )
    resp.raise_for_status()
    return len(fresh)


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    firecrawl_key = os.environ.get("FIRECRAWL_API_KEY")
    if not (supabase_url and service_key and firecrawl_key):
        print("Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRECRAWL_API_KEY", file=sys.stderr)
        return 1

    events = firecrawl_extract(firecrawl_key)
    print(f"Extracted {len(events)} events from {SOURCE_URL}")
    inserted = upsert_races(supabase_url.rstrip("/"), service_key, events)
    print(f"Inserted {inserted} new races")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
