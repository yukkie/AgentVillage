import json
from pathlib import Path

from src.domain.agent import AgentState

STATE_DIR = Path("state/agents")


def _ensure_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def save(agent: AgentState) -> None:
    _ensure_dir()
    path = STATE_DIR / f"{agent.name.lower()}.json"
    path.write_text(agent.model_dump_json(indent=2), encoding="utf-8")


def load(name: str) -> AgentState:
    path = STATE_DIR / f"{name.lower()}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return AgentState.model_validate(data)


def load_all_from_dir(path: Path) -> list[AgentState]:
    agents = []
    for p in sorted(path.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        agents.append(AgentState.model_validate(data))
    return agents


def load_all() -> list[AgentState]:
    _ensure_dir()
    return load_all_from_dir(STATE_DIR)
