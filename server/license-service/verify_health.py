"""Bounded readiness check; loopback only, no credentials or mutations."""
import json
import time
from urllib.request import urlopen
from app import VERSION

for attempt in range(20):
    try:
        with urlopen("http://127.0.0.1:8787/healthz", timeout=2) as response:
            value = json.load(response)
        if value.get("status") == "ok" and value.get("version") == VERSION:
            print(json.dumps(value))
            break
    except OSError:
        pass
    time.sleep(0.5)
else:
    raise SystemExit("Licensing service did not become ready")
