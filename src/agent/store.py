import json
from pathlib import Path

from src.domain.actor import Actor, ActorState, make_actor

STATE_DIR = Path("state/agents")


def _ensure_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def save(actor: Actor) -> None:
    _ensure_dir()
    path = STATE_DIR / f"{actor.name.lower()}.json"
    data = json.loads(actor.state.model_dump_json())
    data["role"] = actor.role.name
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load(name: str) -> Actor:
    path = STATE_DIR / f"{name.lower()}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return make_actor(ActorState.model_validate(data), data["role"])


def load_all_from_dir(path: Path) -> list[Actor]:
    actors = []
    for p in sorted(path.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        actors.append(make_actor(ActorState.model_validate(data), data["role"]))
    return actors


def load_all() -> list[Actor]:
    _ensure_dir()
    return load_all_from_dir(STATE_DIR)
