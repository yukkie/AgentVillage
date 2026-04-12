from src.domain.agent import AgentState
from src.agent import store


def update_memory(agent: AgentState, memory_updates: list[str]) -> AgentState:
    """Append memory_updates to agent's memory_summary and persist."""
    for item in memory_updates:
        if item and item not in agent.memory_summary:
            agent.memory_summary.append(item)
    store.save(agent)
    return agent
