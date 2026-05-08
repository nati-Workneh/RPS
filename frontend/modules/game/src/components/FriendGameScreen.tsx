import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardCell, MatchView, Piece, Weapon } from "@shared/types";
import { BOARD_COLS, BOARD_ROWS, getTurnDurationForDifficulty } from "@shared/constants";
import type { AuthSession, FriendRoomView } from "../api/friendApi";
import {
  chooseFriendDecoy,
  chooseFriendFlag,
  getFriendRoom,
  moveFriendPiece,
  shuffleFriendPieces,
  swapFriendRevealPiece,
} from "../api/friendApi";
import { GameBoard } from "./GameBoard";
import { PlayerNameLabel } from "./PlayerNameLabel";
import { DuelOverlay } from "./DuelOverlay";
import { GameOverScreen } from "./GameOverScreen";
import { VideoBackground } from "./VideoBackground";
import { FallingLeavesBackground } from "./FallingLeavesBackground";
import { FriendSidebar } from "./FriendSidebar";
import { audioManager, JUMP_DURATION_MS } from "../utils/audioManager";

const GAME_BACKGROUND_OVERLAY = "linear-gradient(rgba(10, 14, 10, 0.64), rgba(10, 14, 10, 0.84))";

interface FriendGameScreenProps {
  session: AuthSession;
  roomId: string;
  onLeaveRoom: () => void;
  onOpenSettings: () => void;
}

function computeValidMoves(piece: Piece, board: Piece[]): Array<{ row: number; col: number }> {
  if (piece.role === "decoy") return [];
  const occupied = new Map(board.filter((item) => item.alive).map((item) => [`${item.row}-${item.col}`, item]));
  const directions = [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 }];
  return directions
    .map(({ dr, dc }) => ({ row: piece.row + dr, col: piece.col + dc }))
    .filter(({ row, col }) => {
      if (row < 1 || row > BOARD_ROWS || col < 1 || col > BOARD_COLS) return false;
      const occupant = occupied.get(`${row}-${col}`);
      return !occupant || occupant.owner === "ai";
    });
}

function buildInviteUrl(roomId: string) {
  const url = new URL(window.location.href);
  url.search = `invite=${roomId}`;
  url.hash = "";
  return url.toString();
}

function shareInviteLink(roomId: string) {
  const inviteUrl = buildInviteUrl(roomId);
  const shareText = `Join me in Squad RPS! ${inviteUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.href = whatsappUrl;
  }
}

export function FriendGameScreen({ session, roomId, onLeaveRoom, onOpenSettings }: FriendGameScreenProps) {
  const [room, setRoom] = useState<FriendRoomView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [movingPieceId, setMovingPieceId] = useState<string | null>(null);
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(0);
  const [showDuel, setShowDuel] = useState(false);
  const [dyingIds, setDyingIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const duelSignatureRef = useRef<string | null>(null);
  const duelTimeoutRef = useRef<number | null>(null);

  const applyRoomUpdate = useCallback((next: FriendRoomView) => {
    setRoom(next);

    const duel = next.match?.duel;
    const duelSignature = duel
      ? `${duel.attackerId}:${duel.defenderId}:${duel.eliminatedId ?? "none"}:${duel.attackerWeapon}:${duel.defenderWeapon}`
      : null;

    if (!duelSignature || duelSignature === duelSignatureRef.current) return;

    duelSignatureRef.current = duelSignature;
    setShowDuel(true);
    setDyingIds(duel.eliminatedId ? new Set([duel.eliminatedId]) : new Set());

    if (duelTimeoutRef.current) {
      window.clearTimeout(duelTimeoutRef.current);
    }

    duelTimeoutRef.current = window.setTimeout(() => {
      setShowDuel(false);
      window.setTimeout(() => setDyingIds(new Set()), 300);
    }, 1900);
  }, []);

  const refreshRoom = useCallback(async () => {
    const next = await getFriendRoom(session.token, roomId);
    applyRoomUpdate(next);
  }, [applyRoomUpdate, roomId, session.token]);

  useEffect(() => {
    setError(null);
    void refreshRoom().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Failed to load your friend match.");
    });
  }, [refreshRoom]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshRoom().catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Sync with your friend failed.");
      });
    }, 1200);

    return () => {
      window.clearInterval(interval);
      if (duelTimeoutRef.current) {
        window.clearTimeout(duelTimeoutRef.current);
      }
    };
  }, [refreshRoom]);

  const match = room?.match ?? null;
  const phase = match?.phase ?? "setup";

  useEffect(() => {
    if (!match?.turnEndsAt || (match.phase !== "player_turn" && match.phase !== "ai_turn")) {
      setTurnSecondsLeft(0);
      return undefined;
    }

    const tick = () => {
      setTurnSecondsLeft(Math.max(0, Math.ceil(match.turnEndsAt! - Date.now() / 1000)));
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [match]);

  const boardCells = useMemo(() => {
    const cells: BoardCell[] = [];
    const lookup = new Map<string, Piece>();
    (match?.board ?? [])
      .filter((piece) => piece.alive)
      .forEach((piece) => lookup.set(`${piece.row}-${piece.col}`, piece));

    for (let row = BOARD_ROWS; row >= 1; row -= 1) {
      for (let col = 1; col <= BOARD_COLS; col += 1) {
        cells.push({ row, col, piece: lookup.get(`${row}-${col}`) ?? null });
      }
    }
    return cells;
  }, [match]);

  const hasPlayerFlag = !!match?.board.some((piece) => piece.owner === "player" && piece.alive && piece.role === "flag");
  const hasPlayerDecoy = !!match?.board.some((piece) => piece.owner === "player" && piece.alive && piece.role === "decoy");

  const validMoves = useMemo(() => {
    if (!match || !selectedPieceId || match.phase !== "player_turn") return [];
    const piece = match.board.find((item) => item.id === selectedPieceId && item.alive);
    if (!piece || piece.owner !== "player") return [];
    return computeValidMoves(piece, match.board);
  }, [match, selectedPieceId]);

  const selectablePieceIds = useMemo(() => {
    if (!match || match.phase !== "player_turn") return new Set<string>();
    return new Set(
      match.board
        .filter((piece) => piece.owner === "player" && piece.alive)
        .filter((piece) => computeValidMoves(piece, match.board).length > 0)
        .map((piece) => piece.id),
    );
  }, [match]);

  const validMoveSet = useMemo(
    () => new Set(validMoves.map((move) => `${move.row}-${move.col}`)),
    [validMoves],
  );

  const applyAction = useCallback(async (operation: () => Promise<FriendRoomView>) => {
    setLoading(true);
    setError(null);
    try {
      const next = await operation();
      applyRoomUpdate(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Friend match update failed.");
    } finally {
      setLoading(false);
    }
  }, [applyRoomUpdate]);

  const onPieceClick = useCallback((piece: Piece) => {
    if (!room?.match || loading) return;

    if (room.match.phase === "reveal") {
      if (piece.owner !== "player" || !piece.alive) return;
      if (!hasPlayerFlag) {
        void applyAction(() => chooseFriendFlag(session.token, room.roomId, piece.id));
      } else if (!hasPlayerDecoy) {
        void applyAction(() => chooseFriendDecoy(session.token, room.roomId, piece.id));
      }
      return;
    }

    if (room.match.phase !== "player_turn" || piece.owner !== "player" || !piece.alive) {
      if (piece.owner === "ai" && selectedPieceId && validMoveSet.has(`${piece.row}-${piece.col}`)) {
        setMovingPieceId(selectedPieceId);
        audioManager.unlock();
        audioManager.playJump();
        window.setTimeout(() => setMovingPieceId(null), JUMP_DURATION_MS);
        void applyAction(() => moveFriendPiece(session.token, room.roomId, selectedPieceId, piece.row, piece.col));
        setSelectedPieceId(null);
      }
      return;
    }

    if (!selectablePieceIds.has(piece.id)) return;
    setSelectedPieceId((current) => (current === piece.id ? null : piece.id));
  }, [
    applyAction,
    hasPlayerDecoy,
    hasPlayerFlag,
    loading,
    room,
    selectablePieceIds,
    selectedPieceId,
    session.token,
    validMoveSet,
  ]);

  const onCellClick = useCallback((row: number, col: number) => {
    if (!room?.match || room.match.phase !== "player_turn" || !selectedPieceId || !validMoveSet.has(`${row}-${col}`)) {
      return;
    }

    setMovingPieceId(selectedPieceId);
    audioManager.unlock();
    audioManager.playJump();
    window.setTimeout(() => setMovingPieceId(null), JUMP_DURATION_MS);
    void applyAction(() => moveFriendPiece(session.token, room.roomId, selectedPieceId, row, col));
    setSelectedPieceId(null);
  }, [applyAction, room, selectedPieceId, session.token, validMoveSet]);

  const onRevealDragStart = useCallback((piece: Piece) => {
    if (!match || match.phase !== "reveal" || loading) return;
    if (piece.owner !== "player" || !piece.alive) return;
    if (!hasPlayerFlag || !hasPlayerDecoy) return;
    if (piece.role !== "flag" && piece.role !== "decoy") return;
    setDraggingPieceId(piece.id);
    setSelectedPieceId(null);
  }, [hasPlayerDecoy, hasPlayerFlag, loading, match]);

  const onRevealDragEnd = useCallback(() => {
    setDraggingPieceId(null);
  }, []);

  const onRevealDrop = useCallback((row: number, col: number) => {
    if (!draggingPieceId) return;
    void applyAction(() => swapFriendRevealPiece(session.token, roomId, draggingPieceId, row, col));
    setDraggingPieceId(null);
  }, [applyAction, draggingPieceId, roomId, session.token]);

  const copyInviteLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(roomId));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Could not copy the invite link.");
    }
  }, [roomId]);

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "16px",
          backgroundColor: "var(--color-board-bg)",
        }}
      >
        <VideoBackground overlay={GAME_BACKGROUND_OVERLAY} fit="contain" />
        <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.6rem", color: "var(--color-danger)" }}>
          Friend Match Error
        </div>
        <div
          style={{
            fontFamily: "var(--font-ui)",
            color: "var(--color-text-muted)",
            maxWidth: "480px",
            textAlign: "center",
            fontSize: "0.92rem",
            lineHeight: "1.6",
          }}
        >
          {error}
        </div>
        <button
          type="button"
          onClick={onLeaveRoom}
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1rem",
            padding: "10px 28px",
            background: "var(--color-logo-text)",
            color: "#1a3a00",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          Back
        </button>
      </div>
    );
  }

  if (!room || room.status === "waiting" || !room.match) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "var(--color-board-bg)",
        }}
      >
        <VideoBackground overlay={GAME_BACKGROUND_OVERLAY} fit="contain" />
        <FallingLeavesBackground />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "min(760px, calc(100vw - 32px))",
              borderRadius: "28px",
              padding: "28px",
              background: "linear-gradient(180deg, rgba(14,20,16,0.94), rgba(8,12,9,0.92))",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.8rem", color: "#F4D377", marginBottom: "6px" }}>
                  Friend Room Ready
                </div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.98rem", lineHeight: "1.6", color: "rgba(247,249,243,0.82)" }}>
                  You are signed in as <strong>{session.user.displayName ?? session.user.email ?? "Player"}</strong>.
                  Share this invite link on WhatsApp and your friend will join the same match room with their own Google account.
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenSettings}
                style={{
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#F7F9F3",
                  padding: "10px 14px",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Settings
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.15fr 0.85fr",
                gap: "16px",
              }}
            >
              <div
                style={{
                  padding: "16px",
                  borderRadius: "20px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", color: "#F7F9F3", marginBottom: "10px" }}>
                  Invite Link
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.82rem",
                    lineHeight: "1.55",
                    color: "rgba(247,249,243,0.74)",
                    padding: "12px 14px",
                    borderRadius: "16px",
                    background: "rgba(0,0,0,0.28)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    wordBreak: "break-all",
                    marginBottom: "12px",
                  }}
                >
                  {buildInviteUrl(roomId)}
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => shareInviteLink(roomId)}
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.94rem",
                      padding: "11px 16px",
                      background: "linear-gradient(180deg, rgba(38,124,72,0.96), rgba(18,73,44,0.96))",
                      color: "#F4FFF7",
                      border: "1px solid rgba(194,255,212,0.28)",
                      borderRadius: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Share on WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyInviteLink()}
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: "0.9rem",
                      padding: "11px 16px",
                      background: "rgba(255,255,255,0.06)",
                      color: "#F7F9F3",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "14px",
                      cursor: "pointer",
                    }}
                  >
                    {copied ? "Copied" : "Copy Invite Link"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  padding: "16px",
                  borderRadius: "20px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", color: "#F7F9F3", marginBottom: "10px" }}>
                  Room Status
                </div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.9rem", color: "rgba(247,249,243,0.8)", lineHeight: "1.65", marginBottom: "10px" }}>
                  Waiting for your friend to open the invite link and sign in with Google.
                </div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.8rem", color: "rgba(247,249,243,0.58)" }}>
                  The match will open automatically as soon as the second player joins.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onLeaveRoom}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "0.92rem",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.06)",
                  color: "#F7F9F3",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "14px",
                  cursor: "pointer",
                }}
              >
                Back To Main Menu
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const playerName = room.playerProfile.displayName ?? "Your Squad";
  const opponentName = room.opponentProfile?.displayName ?? "Friend";
  const phaseLabel =
    match.phase === "reveal"
      ? hasPlayerFlag && hasPlayerDecoy
        ? "WAITING FOR FRIEND"
        : !hasPlayerFlag
        ? "PLACE FLAG"
        : "PLACE DECOY"
      : match.phase === "player_turn"
      ? "YOUR TURN"
      : match.phase === "ai_turn"
      ? "FRIEND TURN"
      : "GAME OVER";

  const statusMessage =
    match.phase === "reveal"
      ? !hasPlayerFlag
        ? "Choose your flag by clicking one of your soldiers."
        : !hasPlayerDecoy
        ? "Choose your Decoy Totem on a different soldier."
        : "Your flag and decoy are ready. Drag either one while you wait for your friend."
      : match.phase === "player_turn"
      ? selectedPieceId
        ? `Click a highlighted square or enemy unit to move - ${turnSecondsLeft}s`
        : `Click one of your units to take your turn - ${turnSecondsLeft}s`
      : match.phase === "ai_turn"
      ? `${opponentName} is choosing a move - ${turnSecondsLeft}s`
      : match.message;

  return (
    <div
      style={{
        height: "100vh",
        position: "relative",
        backgroundColor: "var(--color-board-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(6px, 0.8vw, 10px)",
        overflow: "hidden",
      }}
    >
      <VideoBackground overlay={GAME_BACKGROUND_OVERLAY} fit="contain" />
      <FallingLeavesBackground />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            flexWrap: "nowrap",
            gap: "clamp(8px, 1vw, 14px)",
            width: "fit-content",
            maxWidth: "none",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
            <PlayerNameLabel name={opponentName} team="ai" />

            <div style={{ position: "relative" }}>
              <GameBoard
                boardCells={boardCells}
                selectedPieceId={selectedPieceId}
                movingPieceId={movingPieceId}
                draggingPieceId={draggingPieceId}
                selectablePieceIds={selectablePieceIds}
                validMoveSet={validMoveSet}
                phase={match.phase}
                dyingIds={dyingIds}
                onPieceClick={onPieceClick}
                onCellClick={onCellClick}
                onRevealDragStart={onRevealDragStart}
                onRevealDragEnd={onRevealDragEnd}
                onRevealDrop={onRevealDrop}
              />

              {match.duel && (
                <DuelOverlay
                  duel={match.duel}
                  visible={showDuel}
                />
              )}

              {match.phase === "finished" && match.result && !showDuel && (
                <GameOverScreen
                  result={match.result}
                  stats={match.stats}
                  difficulty={match.difficulty}
                  onPlayAgain={onLeaveRoom}
                />
              )}
            </div>

            <PlayerNameLabel name={playerName} team="player" />

            <div
              style={{
                marginTop: "6px",
                width: "100%",
                padding: "6px 10px",
                background: "rgba(0, 0, 0, 0.45)",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.07)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minHeight: "30px",
              }}
            >
              <span style={{ fontSize: "0.66rem", opacity: 0.5 }}>*</span>
              <span
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "0.68rem",
                  color: "var(--color-text-muted)",
                  flex: 1,
                }}
              >
                {statusMessage}
              </span>

              {match.phase === "reveal" && !hasPlayerFlag && (
                <button
                  type="button"
                  onClick={() => void applyAction(() => shuffleFriendPieces(session.token, room.roomId))}
                  disabled={loading}
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.62rem",
                    padding: "3px 8px",
                    background: "rgba(255,215,0,0.16)",
                    color: "#FFD700",
                    border: "1px solid rgba(255,215,0,0.4)",
                    borderRadius: "9px",
                    cursor: loading ? "wait" : "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    animation: loading ? undefined : "shuffleAttention 1s ease-in-out infinite",
                  }}
                >
                  Shuffle Soldiers
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "var(--sidebar-width)" }}>
            <FriendSidebar
              match={match}
              playerName={playerName}
              opponentName={opponentName}
              phaseLabel={phaseLabel}
              turnTimer={Math.min(turnSecondsLeft, match.turnDurationSeconds || getTurnDurationForDifficulty(match.difficulty))}
              loading={loading}
              onOpenSettings={onOpenSettings}
              onBackToMenu={onLeaveRoom}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
