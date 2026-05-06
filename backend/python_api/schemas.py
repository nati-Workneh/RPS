from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Difficulty = Literal["easy", "medium", "hard"]
Weapon = Literal["rock", "paper", "scissors"]


class SquadGenerateRequest(BaseModel):
    difficulty: Difficulty = "medium"


class MatchCreateRequest(BaseModel):
    difficulty: Difficulty = "medium"
    turn_duration_seconds: int = Field(default=10, alias="turnDurationSeconds", ge=5, le=120)


class MatchSettingsUpdateRequest(BaseModel):
    turn_duration_seconds: int = Field(alias="turnDurationSeconds", ge=5, le=120)


class RevealCompleteRequest(BaseModel):
    confirmed: bool = True


class ShuffleMatchRequest(BaseModel):
    pass


class PlayerFlagRequest(BaseModel):
    piece_id: str = Field(alias="pieceId")


class PlayerMoveRequest(BaseModel):
    piece_id: str = Field(alias="pieceId")
    target_row: int = Field(alias="targetRow")
    target_col: int = Field(alias="targetCol")


class TieRepickRequest(BaseModel):
    weapon: Weapon
