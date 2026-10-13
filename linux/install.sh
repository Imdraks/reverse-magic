#!/usr/bin/env bash
set -euo pipefail
LANTERN_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ ! -f "$LANTERN_ROOT/linux/lantern.py" ]]; then LANTERN_ROOT=$(cd -- "$LANTERN_ROOT/.." && pwd); fi
cd "$LANTERN_ROOT"
if [[ $EUID -eq 0 ]]; then echo 'Lancez ./install.sh depuis votre utilisateur, sans sudo.' >&2; exit 1; fi
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11 ou plus récent requis"'
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -r linux/requirements.txt
LANTERN_NODE="$LANTERN_ROOT/runtime/bin/node"
if [[ ! -x "$LANTERN_NODE" ]]; then
  LANTERN_NODE=$(command -v node || true)
  if [[ -z "$LANTERN_NODE" ]]; then echo 'Utilisez le paquet complet ou installez Node.js 22/24.' >&2; exit 1; fi
  npm ci --prefix homekit --omit=dev --ignore-scripts --no-audit --no-fund
fi
"$LANTERN_NODE" -e 'if (![22,24].includes(Number(process.versions.node.split(".")[0]))) throw new Error("Node 22/24 requis"); require("./homekit/node_modules/hap-nodejs"); require("./homekit/node_modules/qrcode")'
chmod +x lantern
./lantern --help
printf '\nInstallation terminée. Lancez ./lantern scan\n'
