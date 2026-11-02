#!/usr/bin/env bash
# Run every gjs unit test. Exit non-zero on any failure.
cd "$(dirname "$0")/.."
status=0
for t in test/*.test.js; do
  echo "== $t"
  gjs -m "$t" || status=1
done
exit $status
