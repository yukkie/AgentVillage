import json
from pathlib import Path

from src.config import STATE_DIR
from src.domain.actor import Actor, actor_from_dict, actor_to_dict


def _ensure_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def save(actor: Actor) -> None:
    _ensure_dir()
    path = STATE_DIR / f"{actor.name.lower()}.json"
    data = actor_to_dict(actor)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load(name: str) -> Actor:
    path = STATE_DIR / f"{name.lower()}.json"
    if not path.exists():
        raise FileNotFoundError(f"Agent state file not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    return actor_from_dict(data)


def load_all_from_dir(path: Path) -> list[Actor]:
    actors = []
    for p in sorted(path.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        actors.append(actor_from_dict(data))
    return actors


def load_all() -> list[Actor]:
    _ensure_dir()
    return load_all_from_dir(STATE_DIR)
