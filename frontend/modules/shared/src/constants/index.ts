export const BOARD_COLS = 7;
export const BOARD_ROWS = 6;
export const UNITS_PER_SQUAD = 14;

export const PLAYER_ROWS  = [1, 2] as const;
export const AI_ROWS      = [5, 6] as const;
export const NEUTRAL_ROWS = [3, 4] as const;

export const REVEAL_DURATION_SECONDS = 10;
export const TURN_DURATION_SECONDS_BY_DIFFICULTY = {
  easy: 30,
  medium: 15,
  hard: 10,
} as const;

export const TURN_DURATION_SECONDS = TURN_DURATION_SECONDS_BY_DIFFICULTY.medium;

export function getTurnDurationForDifficulty(difficulty: "easy" | "medium" | "hard") {
  return TURN_DURATION_SECONDS_BY_DIFFICULTY[difficulty];
}
