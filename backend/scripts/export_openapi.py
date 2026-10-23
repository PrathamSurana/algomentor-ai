import json
from pathlib import Path

from app.main import app

target = Path(__file__).resolve().parents[2] / "shared" / "openapi.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
print(f"Wrote {target}")
