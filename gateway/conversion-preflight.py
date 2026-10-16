#!/usr/bin/env python3
"""Read-only Linux preparation checks. Never configures networking or flashes a bulb."""
import json
import platform
import re
import shutil
import subprocess
import sys


def command(arguments):
    try:
        result = subprocess.run(arguments, capture_output=True, text=True, timeout=8)
        return result.returncode == 0, result.stdout[:131072]
    except (OSError, subprocess.TimeoutExpired):
        return False, ''


def inspect():
    checks = []
    linux = sys.platform == 'linux'
    native = linux and 'microsoft' not in platform.release().lower()
    checks.append(dict(name='Linux natif', ok=native,
                       detail='Démarrer sur la clé USB Linux si nécessaire ; WSL ne garantit pas le contrôle du Wi-Fi.'))
    for name in ('git', 'docker', 'iw'):
        checks.append(dict(name=name, ok=bool(shutil.which(name))))
    if native and shutil.which('iw'):
        ok, text = command(['iw', 'list'])
        checks.append(dict(name='Au moins un adaptateur annonce le mode AP',
                           ok=bool(ok and re.search(r'^\s*\* AP\s*$', text, re.M)),
                           detail='Vérifier séparément que cet adaptateur est dédié à Cloudcutter ; ce contrôle ne teste pas le pilote ni la conversion.'))
    if native and shutil.which('docker'):
        ok, _ = command(['docker', 'info', '--format', '{{.ServerVersion}}'])
        checks.append(dict(name='Moteur Docker accessible', ok=ok))
    return dict(checks=checks, canFlash=False,
                note='Diagnostic de préparation uniquement. Aucun réseau modifié, aucun paquet installé, aucune commande envoyée à une ampoule. La compatibilité du firmware reste à confirmer.')


if __name__ == '__main__':
    report = inspect()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if all(row['ok'] for row in report['checks']) else 1)
