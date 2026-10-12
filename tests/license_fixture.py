"""Isolated HTTP server for the Electron licensing integration test. Never uses production data."""
import json
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server" / "license-service"))
from app import create_app, initialize, b64
from admin import set_admin
from software_admin import create_software_admin
from cryptography.hazmat.primitives import serialization
from flask import Flask
from werkzeug.serving import make_server, WSGIRequestHandler


class QuietHandler(WSGIRequestHandler):
    def log(self, *args, **kwargs):
        pass


with tempfile.TemporaryDirectory(prefix="synapsex-license-test-") as directory:
    data = Path(directory) / "data"
    key = Path(directory) / "key.pem"
    initialize(data, key)
    set_admin(data, "testadmin", "local-integration-test-password")
    create_software_admin(data, "1", "shortx", allow_owner_short_credentials=True)
    server = make_server("127.0.0.1", 0, Flask("placeholder"), request_handler=QuietHandler)
    endpoint = "http://127.0.0.1:" + str(server.server_port)
    os.environ["SYNAPSEX_ADMIN_ORIGIN"] = endpoint
    os.environ["SYNAPSEX_REGISTRATION_ENABLED"] = "1"
    server.app = create_app(data, key)
    public = serialization.load_pem_private_key(key.read_bytes(), None).public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    print(json.dumps({"endpoint": endpoint, "publicKey": b64(public)}), flush=True)
    server.serve_forever()
