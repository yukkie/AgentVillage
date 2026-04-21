from dataclasses import dataclass


@dataclass
class Vote:
    target: str


@dataclass
class Inspect:
    target: str


@dataclass
class Attack:
    target: str


@dataclass
class CO:
    role: str


ActionType = Vote | Inspect | Attack | CO
