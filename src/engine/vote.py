import random
from collections import Counter


def tally_votes(votes: dict[str, str]) -> str:
    """
    Tally votes and return the eliminated player.
    votes: {voter_name: target_name}
    On a tie, randomly choose among tied candidates.
    """
    if not votes:
        raise ValueError("No votes cast")

    counts = Counter(votes.values())
    max_votes = max(counts.values())
    candidates = [name for name, count in counts.items() if count == max_votes]

    return random.choice(candidates)
