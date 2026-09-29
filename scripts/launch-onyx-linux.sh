#!/bin/sh
set -eu

launcher_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$launcher_dir/scope-launcher" ]; then
  exec "$launcher_dir/scope-launcher" --disable-setuid-sandbox "$@"
else
  exec "$launcher_dir/onyx-launcher" --disable-setuid-sandbox "$@"
fi
