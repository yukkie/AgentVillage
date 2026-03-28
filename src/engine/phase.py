from enum import Enum


class Phase(Enum):
    DAY_OPENING = "day_opening"
    DAY_DISCUSSION = "day_discussion"
    DAY_VOTE = "day_vote"
    NIGHT = "night"
    GAME_OVER = "game_over"
