import json
from pathlib import Path

from src.agent.state import AgentState

STATE_DIR = Path("state/agents")


def _ensure_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def save(agent: AgentState) -> None:
    _ensure_dir()
    path = STATE_DIR / f"{agent.name.lower()}.json"
    path.write_text(agent.model_dump_json(indent=2))


def load(name: str) -> AgentState:
    path = STATE_DIR / f"{name.lower()}.json"
    data = json.loads(path.read_text())
    return AgentState.model_validate(data)


def load_all() -> list[AgentState]:
    _ensure_dir()
    agents = []
    for path in sorted(STATE_DIR.glob("*.json")):
        data = json.loads(path.read_text())
        agents.append(AgentState.model_validate(data))
    return agents
