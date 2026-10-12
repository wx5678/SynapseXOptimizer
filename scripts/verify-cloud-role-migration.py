"""Read-only production migration check; prints no accounts, passwords or keys."""
import sqlite3
import json
from pathlib import Path

matches = list(Path('/var/backups/synapsex-license').glob('20260915T164349*.sqlite3'))
assert len(matches) == 1, 'Expected exactly one deployment backup'
backup = matches[0]
print('DEPLOYMENT_BACKUP', backup.name)
before = sqlite3.connect('file:' + str(backup) + '?mode=ro', uri=True)
after = sqlite3.connect('file:/var/lib/synapsex-license/licenses.sqlite3?mode=ro', uri=True)
results = {}
for table in ('users', 'licenses', 'devices', 'admins', 'user_licenses'):
    cols = [r[1] for r in before.execute('PRAGMA table_info(' + table + ')')]
    query = 'SELECT ' + ','.join(cols) + ' FROM ' + table + ' ORDER BY 1'
    results[table + '_preserved'] = before.execute(query).fetchall() == after.execute(query).fetchall()
results['assigned_software_admins'] = after.execute("SELECT count(*) FROM users WHERE role='admin'").fetchone()[0]
print(json.dumps(results))
assert all(value for key, value in results.items() if key.endswith('_preserved'))
before.close()
after.close()
