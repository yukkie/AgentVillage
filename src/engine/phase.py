from enum import Enum


class Phase(Enum):
    DAY_SPEAK = "day_speak"
    DAY_REASON = "day_reason"
    DAY_VOTE = "day_vote"
    NIGHT = "night"
    GAME_OVER = "game_over"
