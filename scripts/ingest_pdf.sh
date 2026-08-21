#!/usr/bin/env bash
# ============================================================================
# Bulk-feed PDFs into the knowledge pipeline from the command line — the same
# route the admin UI (/admin/knowledge) posts to, for when you have a folder
# of studies instead of one file.
#
#   APP_URL=https://your-app.vercel.app CRON_SECRET=... \
#     scripts/ingest_pdf.sh research_only docs/pdfs/*.pdf
#
# Argument 1 is the rights class: own | licensed | research_only.
# research_only (the safe default for third-party material) can never produce
# library blocks — principles and calibration constants only.
#
# Requires: bash, curl, base64, python3 (for JSON escaping).
# ============================================================================
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
: "${CRON_SECRET:?set CRON_SECRET (the operator secret) first}"

LICENSE="${1:-research_only}"
case "$LICENSE" in
  own|licensed|research_only) shift ;;
  *) echo "first argument must be own | licensed | research_only" >&2; exit 1 ;;
esac

if [ "$#" -eq 0 ]; then
  echo "usage: APP_URL=... CRON_SECRET=... $0 <own|licensed|research_only> file.pdf [more.pdf ...]" >&2
  exit 1
fi

for pdf in "$@"; do
  [ -f "$pdf" ] || { echo "skip (not a file): $pdf" >&2; continue; }
  name="$(basename "$pdf")"
  title="${name%.pdf}"
  echo "→ $name ($LICENSE)"

  # Build the JSON body with python3 so filenames and titles are escaped properly.
  body="$(python3 - "$pdf" "$name" "$title" "$LICENSE" <<'PY'
import base64, json, sys
path, name, title, license = sys.argv[1:5]
with open(path, "rb") as fh:
    data = base64.b64encode(fh.read()).decode()
print(json.dumps({
    "title": title, "filename": name, "pdf_base64": data, "license": license,
}))
PY
)"

  curl -sS -X POST "$APP_URL/api/admin/knowledge/documents" \
    -H "authorization: Bearer $CRON_SECRET" \
    -H "content-type: application/json" \
    --data-binary "$body" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  ", d.get("error") or d.get("status"), d.get("proposals",""))'
done

echo "Review the proposals at $APP_URL/admin/knowledge"
