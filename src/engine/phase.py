from enum import Enum


class Phase(Enum):
    DAY_DISCUSSION = "day_discussion"
    DAY_VOTE = "day_vote"
    NIGHT = "night"
    NIGHT_WOLF_CHAT = "night_wolf_chat"
    GAME_OVER = "game_over"
