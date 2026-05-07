import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Piece, BoardCell, Phase, DuelSummary, MatchView, MatchStats, Difficulty, Weapon, Owner
} from "@shared/types";
import { BOARD_COLS, BOARD_ROWS, getTurnDurationForDifficulty } from "@shared/constants";
import { audioManager, JUMP_DURATION_MS } from "../utils/audioManager";
import {
  createMatch as engineCreateMatch,
  completeReveal as engineCompleteReveal,
  shufflePlayerPiecesEngine,
  choosePlayerFlagEngine,
  playerMoveEngine,
  tieRepickEngine,
  aiMoveEngine,
  turnTimeoutEngine,
  updateTurnDurationEngine,
} from "../engine/gameEngine";

export type UiPhase = "WAITING_FOR_PLAYER" | "MOVING" | "BATTLE" | "GAME_OVER" | Phase;

export interface UseGameReturn {
  boardCells:        BoardCell[];
  match:             MatchView | null;
  phase:             Phase;
  uiPhase:           UiPhase;
  selectedPieceId:   string | null;
  movingPieceId:     string | null;
  selectablePieceIds: Set<string>;
  validMoveSet:      Set<string>;
  error:             string | null;
  loading:           boolean;
  revealSecondsLeft: number;
  turnSecondsLeft:   number;
  difficulties:      Array<{ id: Difficulty; label: string; detail: string }>;
  selectedDifficulty: Difficulty;
  showDuel:          boolean;
  dyingIds:          Set<string>;
  setSelectedDifficulty: (d: Difficulty) => void;
  onPieceClick:      (piece: Piece) => void;
  onCellClick:       (row: number, col: number) => void;
  shufflePlayerPieces: () => Promise<void>;
  startMatch:        () => Promise<void>;
  resetMatch:        () => Promise<void>;
  resetToSetup:      () => void;
  submitRepick:      (weapon: Weapon) => Promise<void>;
  skipReveal:        () => Promise<void>;
}

interface UseGameOptions {
  turnDurations?: Record<Difficulty, number>;
}

const DIFFICULTIES: Array<{ id: Difficulty; label: string; detail: string }> = [
  { id: "easy",   label: "Easy",   detail: "AI plays mostly random valid moves." },
  { id: "medium", label: "Medium", detail: "AI uses remembered reveals when possible." },
  { id: "hard",   label: "Hard",   detail: "AI pressures known favorable matchups." },
];

function computeValidMoves(piece: Piece, board: Piece[]): Array<{ row: number; col: number }> {
  const occupied = new Map(board.filter(p => p.alive).map(p => [`${p.row}-${p.col}`, p]));
  const dirs = [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 }];
  return dirs
    .map(({ dr, dc }) => ({ row: piece.row + dr, col: piece.col + dc }))
    .filter(({ row, col }) => {
      if (row < 1 || row > BOARD_ROWS || col < 1 || col > BOARD_COLS) return false;
      const occ = occupied.get(`${row}-${col}`);
      return !occ || occ.owner === "ai";
    });
}

function isTimedTurnPhase(phase: Phase): boolean {
  return phase === "player_turn" || phase === "ai_turn" || phase === "repick";
}

const DEFAULT_TURN_DURATIONS: Record<Difficulty, number> = {
  easy: getTurnDurationForDifficulty("easy"),
  medium: getTurnDurationForDifficulty("medium"),
  hard: getTurnDurationForDifficulty("hard"),
};

export function useGame(options: UseGameOptions = {}): UseGameReturn {
  const turnDurations = options.turnDurations ?? DEFAULT_TURN_DURATIONS;
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("medium");
  const [match,              setMatch]              = useState<MatchView | null>(null);
  const [selectedPieceId,    setSelectedPieceId]    = useState<string | null>(null);
  const [movingPieceId,      setMovingPieceId]      = useState<string | null>(null);
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [revealSecondsLeft,  setRevealSecondsLeft]  = useState(0);
  const [turnSecondsLeft,    setTurnSecondsLeft]    = useState(0);
  const [showDuel,           setShowDuel]           = useState(false);
  const [dyingIds,           setDyingIds]           = useState<Set<string>>(new Set());
  const aiInFlightRef = useRef(false);
  const matchRef      = useRef<MatchView | null>(null);
  const timeoutInFlightRef = useRef(false);

  useEffect(() => { matchRef.current = match; }, [match]);

  useEffect(() => {
    const current = matchRef.current;
    if (!current) return;

    const configuredDuration = turnDurations[current.difficulty];
    if (!configuredDuration || current.turnDurationSeconds === configuredDuration) return;

    try {
      const next = updateTurnDurationEngine(current.matchId, configuredDuration);
      setMatch(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Timer update failed.");
    }
  }, [turnDurations]);

  const hasPlayerFlag = useMemo(
    () => !!match?.board.some(piece => piece.owner === "player" && piece.alive && piece.role === "flag"),
    [match],
  );

  const validMoves = useMemo(() => {
    if (!match || !selectedPieceId || match.phase !== "player_turn") return [];
    const piece = match.board.find(p => p.id === selectedPieceId && p.alive);
    if (!piece || piece.owner !== "player") return [];
    return computeValidMoves(piece, match.board);
  }, [match, selectedPieceId]);

  const validMoveSet = useMemo(
    () => new Set(validMoves.map(m => `${m.row}-${m.col}`)),
    [validMoves],
  );

  const selectablePieceIds = useMemo(() => {
    if (!match || match.phase !== "player_turn") return new Set<string>();
    return new Set(
      match.board
        .filter(piece => piece.alive && piece.owner === "player")
        .filter(piece => computeValidMoves(piece, match.board).length > 0)
        .map(piece => piece.id),
    );
  }, [match]);

  // ── Reveal timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!match || match.phase !== "reveal") {
      setRevealSecondsLeft(0);
      return undefined;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil(match.revealEndsAt - Date.now() / 1000));
      setRevealSecondsLeft(remaining);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [match]);

  useEffect(() => {
    if (!match || !isTimedTurnPhase(match.phase) || !match.turnEndsAt) {
      setTurnSecondsLeft(0);
      return undefined;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil(match.turnEndsAt! - Date.now() / 1000));
      setTurnSecondsLeft(remaining);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [match]);

  useEffect(() => {
    if (!match || match.phase !== "reveal") return;
    if (Date.now() / 1000 < match.revealEndsAt) return;
    void handleCompleteReveal();
  }, [match, revealSecondsLeft]);

  useEffect(() => {
    if (!match || !isTimedTurnPhase(match.phase) || !match.turnEndsAt || timeoutInFlightRef.current) return;
    if (Date.now() / 1000 < match.turnEndsAt) return;
    timeoutInFlightRef.current = true;
    void handleTurnTimeout().finally(() => {
      timeoutInFlightRef.current = false;
    });
  }, [match, turnSecondsLeft]);

  // ── Apply state with animation ───────────────────────────────────
  const applyState = useCallback((next: MatchView) => {
    if (next.duel && !next.duel.tie) {
      setMatch(prev => ({ ...next, board: prev?.board ?? next.board, phase: prev?.phase ?? next.phase }));
      setShowDuel(true);
      if (next.duel.eliminatedId) setDyingIds(new Set([next.duel.eliminatedId]));

      setTimeout(() => {
        setShowDuel(false);
        setMatch(next);
        setTimeout(() => setDyingIds(new Set()), 400);
      }, 2000);
    } else {
      setMatch(next);
      setShowDuel(next.phase === "repick");
    }
  }, []);

  // ── AI turn ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!match || match.phase !== "ai_turn" || aiInFlightRef.current || showDuel) return;
    aiInFlightRef.current = true;
    const timeout = window.setTimeout(() => {
      try {
        const next = aiMoveEngine(match.matchId);
        applyState(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "AI move failed.");
      } finally {
        aiInFlightRef.current = false;
      }
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [match, showDuel, applyState]);

  // ── Board cells ───────────────────────────────────────────────────
  const boardCells = useMemo(() => {
    const lookup = new Map<string, Piece>();
    (match?.board ?? []).filter(p => p.alive).forEach(p => lookup.set(`${p.row}-${p.col}`, p));
    const cells: BoardCell[] = [];
    for (let row = BOARD_ROWS; row >= 1; row -= 1) {
      for (let col = 1; col <= BOARD_COLS; col += 1) {
        cells.push({ row, col, piece: lookup.get(`${row}-${col}`) ?? null });
      }
    }
    return cells;
  }, [match]);

  // ── Actions ───────────────────────────────────────────────────────
  async function createMatchInternal(clearCurrentMatch: boolean) {
    setLoading(true);
    setError(null);
    setSelectedPieceId(null);
    setMovingPieceId(null);
    setTurnSecondsLeft(0);
    setShowDuel(false);
    setDyingIds(new Set());
    if (clearCurrentMatch) {
      aiInFlightRef.current = false;
      setMatch(null);
    }
    try {
      const created = engineCreateMatch(
        selectedDifficulty,
        turnDurations[selectedDifficulty] ?? getTurnDurationForDifficulty(selectedDifficulty),
      );
      setMatch(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to start game.");
    } finally {
      setLoading(false);
    }
  }

  async function startMatch() {
    await createMatchInternal(false);
  }

  async function resetMatch() {
    await createMatchInternal(true);
  }

  async function handleCompleteReveal() {
    const current = matchRef.current;
    if (!current || current.phase !== "reveal") return;
    try {
      const next = engineCompleteReveal(current.matchId);
      setMatch(next);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Reveal transition failed.";
      setError(`Could not advance past reveal phase: ${msg}. Use the Skip button or restart.`);
    }
  }

  async function skipReveal() {
    if (!hasPlayerFlag) return;
    setError(null);
    await handleCompleteReveal();
  }

  async function shufflePlayerPieces() {
    const current = matchRef.current;
    if (!current || current.phase !== "reveal") return;
    setLoading(true);
    setError(null);
    try {
      const next = shufflePlayerPiecesEngine(current.matchId);
      setMatch(next);
      audioManager.unlock();
      audioManager.play("shuffle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shuffle failed.");
    } finally {
      setLoading(false);
    }
  }

  async function choosePlayerFlag(pieceId: string) {
    const current = matchRef.current;
    if (!current || current.phase !== "reveal") return;
    setLoading(true);
    setError(null);
    try {
      const next = choosePlayerFlagEngine(current.matchId, pieceId);
      setMatch(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Flag selection failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTurnTimeout() {
    const current = matchRef.current;
    if (!current || !isTimedTurnPhase(current.phase)) return;
    try {
      const next = turnTimeoutEngine(current.matchId);
      setMatch(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Turn timeout handling failed.");
    }
  }

  async function movePiece(targetRow: number, targetCol: number) {
    const current = matchRef.current;
    if (!current || current.phase !== "player_turn" || !selectedPieceId) return;
    setLoading(true);
    setError(null);

    setMovingPieceId(selectedPieceId);
    audioManager.unlock();
    audioManager.playJump();
    window.setTimeout(() => setMovingPieceId(null), JUMP_DURATION_MS);

    try {
      const next = playerMoveEngine(current.matchId, selectedPieceId, targetRow, targetCol);
      applyState(next);
      setSelectedPieceId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Move failed.");
    } finally {
      setLoading(false);
    }
  }

  async function submitRepick(weapon: Weapon) {
    const current = matchRef.current;
    if (!current || current.phase !== "repick") return;
    setLoading(true);
    setError(null);
    try {
      const next = tieRepickEngine(current.matchId, weapon);
      applyState(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repick failed.");
    } finally {
      setLoading(false);
    }
  }

  function onPieceClick(piece: Piece) {
    console.debug("[onPieceClick] piece=%s owner=%s phase=%s alive=%s", piece.id, piece.owner, match?.phase, piece.alive);

    if (match?.phase === "reveal") {
      if (piece.owner === "player" && piece.alive) {
        void choosePlayerFlag(piece.id);
      }
      return;
    }

    if (!match || showDuel || match.phase !== "player_turn" || !piece.alive) return;

    if (piece.owner === "player") {
      if (!selectablePieceIds.has(piece.id)) return;
      setSelectedPieceId(prev => prev === piece.id ? null : piece.id);
      return;
    }

    if (piece.owner === "ai" && selectedPieceId && validMoveSet.has(`${piece.row}-${piece.col}`)) {
      void movePiece(piece.row, piece.col);
    }
  }

  function onCellClick(row: number, col: number) {
    if (!match || showDuel || match.phase !== "player_turn" || !selectedPieceId) return;
    if (!validMoveSet.has(`${row}-${col}`)) return;
    const occupant = match.board.find(p => p.alive && p.row === row && p.col === col);
    if (!occupant) void movePiece(row, col);
  }

  function resetToSetup() {
    setMatch(null);
    setSelectedPieceId(null);
    setMovingPieceId(null);
    setError(null);
    setLoading(false);
    setTurnSecondsLeft(0);
    setShowDuel(false);
    setDyingIds(new Set());
    audioManager.stopBgm();
  }

  const phase = match?.phase ?? "setup";

  const uiPhase: UiPhase = (() => {
    if (phase === "finished") return "GAME_OVER";
    if (showDuel)             return "BATTLE";
    if (movingPieceId)        return "MOVING";
    if (phase === "player_turn") return "WAITING_FOR_PLAYER";
    return phase;
  })();

  return {
    boardCells,
    match,
    phase,
    uiPhase,
    selectedPieceId,
    movingPieceId,
    selectablePieceIds,
    validMoveSet,
    error,
    loading,
    revealSecondsLeft,
    turnSecondsLeft,
    difficulties:       DIFFICULTIES,
    selectedDifficulty,
    showDuel,
    dyingIds,
    setSelectedDifficulty,
    onPieceClick,
    onCellClick,
    shufflePlayerPieces,
    startMatch,
    resetMatch,
    resetToSetup,
    submitRepick,
    skipReveal,
  };
}
