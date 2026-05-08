import { useEffect, useRef, useState } from "react";
import { useGame } from "../hooks/useGame";
import { useAudio } from "../hooks/useAudio";
import { getTurnDurationForDifficulty } from "@shared/constants";
import { audioManager } from "../utils/audioManager";
import {
  createFriendRoom,
  fetchCurrentUser,
  joinFriendRoom,
  type AuthSession,
} from "../api/friendApi";

import { GameBoard } from "./GameBoard";
import { PlayerNameLabel } from "./PlayerNameLabel";
import { Sidebar } from "./Sidebar";
import { DuelOverlay } from "./DuelOverlay";
import { GameOverScreen } from "./GameOverScreen";
import { StartScreen } from "./StartScreen";
import { FallingLeavesBackground } from "./FallingLeavesBackground";
import { VideoBackground } from "./VideoBackground";
import { SettingsModal, type GameSettingsState } from "./SettingsModal";
import { GoogleAuthModal } from "./GoogleAuthModal";
import { FriendGameScreen } from "./FriendGameScreen";

const GAME_BACKGROUND_OVERLAY = "linear-gradient(rgba(10, 14, 10, 0.64), rgba(10, 14, 10, 0.84))";
const SETTINGS_STORAGE_KEY = "squad-rps-settings";
const AUTH_STORAGE_KEY = "squad-rps-auth";
const FLAG_CURSOR_IMAGE = "/flag_red_nobg.png";
const DECOY_CURSOR_IMAGE = "/game_piece_totem_nobg.png";

const REVEAL_PICK_FLAG_LABEL =
  "Your cursor is the flag. Click one soldier to place it";
const REVEAL_PICK_DECOY_LABEL =
  "Your cursor is now the decoy totem. Click a different soldier to place it";
const REVEAL_READY_LABEL =
  "Flag and decoy locked. You can now drag either one before the match starts";
const REVEAL_REQUIRED_LABEL =
  "Pick both your flag and decoy before the reveal ends";

const DEFAULT_GAME_SETTINGS: GameSettingsState = {
  turnDurations: {
    easy: getTurnDurationForDifficulty("easy"),
    medium: getTurnDurationForDifficulty("medium"),
    hard: getTurnDurationForDifficulty("hard"),
  },
  musicEnabled: true,
  musicVolume: 100,
};

function clampTurnDuration(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(120, Math.max(5, Math.round(value)));
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function loadStoredSettings(): GameSettingsState {
  if (typeof window === "undefined") return DEFAULT_GAME_SETTINGS;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<GameSettingsState> | null;
    if (!parsed) return DEFAULT_GAME_SETTINGS;

    return {
      turnDurations: {
        easy: clampTurnDuration(parsed.turnDurations?.easy ?? DEFAULT_GAME_SETTINGS.turnDurations.easy),
        medium: clampTurnDuration(parsed.turnDurations?.medium ?? DEFAULT_GAME_SETTINGS.turnDurations.medium),
        hard: clampTurnDuration(parsed.turnDurations?.hard ?? DEFAULT_GAME_SETTINGS.turnDurations.hard),
      },
      musicEnabled: parsed.musicEnabled ?? DEFAULT_GAME_SETTINGS.musicEnabled,
      musicVolume: clampVolume(parsed.musicVolume ?? DEFAULT_GAME_SETTINGS.musicVolume),
    };
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}

function persistSettings(settings: GameSettingsState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function loadStoredAuth(): AuthSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession | null;
    if (!parsed?.token || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistAuth(session: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

type FriendIntent =
  | { type: "invite" }
  | { type: "join"; roomId: string }
  | null;

function getBlurStyle(blurred: boolean) {
  return {
    filter: blurred ? "blur(16px) saturate(0.82)" : "none",
    transform: blurred ? "scale(1.015)" : "scale(1)",
    transition: "filter 220ms ease, transform 220ms ease",
    pointerEvents: blurred ? "none" : "auto",
    userSelect: blurred ? "none" : "auto",
  } as const;
}

export function GameScreen() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettingsState>(() => loadStoredSettings());
  const [gameScale, setGameScale] = useState(1);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0, visible: false });
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => loadStoredAuth());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPendingLabel, setAuthPendingLabel] = useState<string | null>(null);
  const [friendIntent, setFriendIntent] = useState<FriendIntent>(() => {
    if (typeof window === "undefined") return null;
    const inviteRoomId = new URL(window.location.href).searchParams.get("invite");
    return inviteRoomId ? { type: "join", roomId: inviteRoomId } : null;
  });
  const [friendRoomId, setFriendRoomId] = useState<string | null>(null);
  const [friendLoading, setFriendLoading] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  const {
    boardCells,
    match,
    phase,
    selectedPieceId,
    movingPieceId,
    draggingPieceId,
    selectablePieceIds,
    validMoveSet,
    error,
    loading,
    revealSecondsLeft,
    turnSecondsLeft,
    difficulties,
    selectedDifficulty,
    showDuel,
    dyingIds,
    setSelectedDifficulty,
    onPieceClick,
    onCellClick,
    onRevealDragStart,
    onRevealDragEnd,
    onRevealDrop,
    shufflePlayerPieces,
    startMatch,
    resetMatch,
    resetToSetup,
    submitRepick,
    skipReveal,
    uiPhase,
  } = useGame({ turnDurations: settings.turnDurations });

  useEffect(() => {
    persistAuth(authSession);
  }, [authSession]);

  useEffect(() => {
    if (!authSession) return undefined;

    let cancelled = false;
    void fetchCurrentUser(authSession.token)
      .then((user) => {
        if (!cancelled) {
          setAuthSession((current) => (current ? { ...current, user } : current));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthSession(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!friendIntent) return;
    if (!authSession) {
      setAuthPendingLabel(
        friendIntent.type === "join"
          ? "Sign in with Google to join your friend's Squad RPS room."
          : "Sign in with Google to create your friend room and send the invite.",
      );
      setAuthModalOpen(true);
      return;
    }
    if (friendLoading) return;

    let cancelled = false;

    const executeFriendIntent = async () => {
      setFriendLoading(true);
      setAuthPendingLabel(friendIntent.type === "join" ? "Joining your friend's room..." : "Creating your friend room...");
      try {
        if (friendIntent.type === "join") {
          const room = await joinFriendRoom(authSession.token, friendIntent.roomId);
          if (cancelled) return;
          setFriendRoomId(room.roomId);
          setAuthModalOpen(false);
        } else {
          const turnDuration = settings.turnDurations[selectedDifficulty];
          const room = await createFriendRoom(authSession.token, selectedDifficulty, turnDuration);
          if (cancelled) return;

          const inviteUrl = new URL(window.location.href);
          inviteUrl.search = `invite=${room.roomId}`;
          inviteUrl.hash = "";
          window.history.replaceState({}, "", inviteUrl.toString());

          setFriendRoomId(room.roomId);
          setAuthModalOpen(false);

          const shareText = `Join me in Squad RPS! ${inviteUrl.toString()}`;
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
          const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
          if (!popup) {
            window.location.href = whatsappUrl;
          }
        }

        setFriendIntent(null);
        setAuthPendingLabel(null);
      } catch (cause) {
        if (!cancelled) {
          setAuthPendingLabel(cause instanceof Error ? cause.message : "Could not open the friend room.");
          setAuthModalOpen(true);
        }
      } finally {
        if (!cancelled) {
          setFriendLoading(false);
        }
      }
    };

    void executeFriendIntent();

    return () => {
      cancelled = true;
    };
  }, [authSession, friendIntent, friendLoading, selectedDifficulty, settings.turnDurations]);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  useEffect(() => {
    audioManager.setMusicMuted(!settings.musicEnabled);
    audioManager.setMusicVolume(settings.musicVolume / 100);
  }, [settings.musicEnabled, settings.musicVolume]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (settingsOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [settingsOpen]);

  useEffect(() => {
    const measureLayout = () => {
      const layout = layoutRef.current;
      if (!layout) return;

      const availableHeight = Math.max(320, window.innerHeight - 12);
      const availableWidth = Math.max(320, window.innerWidth - 12);
      const naturalHeight = Math.max(layout.scrollHeight, 1);
      const naturalWidth = Math.max(layout.scrollWidth, 1);
      const nextScale = Math.min(1, availableHeight / naturalHeight, availableWidth / naturalWidth);

      setGameScale((current) => (Math.abs(current - nextScale) < 0.01 ? current : nextScale));
    };

    const frameId = window.requestAnimationFrame(measureLayout);
    window.addEventListener("resize", measureLayout);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", measureLayout);
    };
  }, [phase, showDuel, settingsOpen]);

  const hasPlayerFlag = !!match?.board.some(
    (piece) => piece.owner === "player" && piece.alive && piece.role === "flag",
  );
  const hasPlayerDecoy = !!match?.board.some(
    (piece) => piece.owner === "player" && piece.alive && piece.role === "decoy",
  );
  const revealPlacementCursorSrc =
    phase === "reveal" && !settingsOpen
      ? !hasPlayerFlag
        ? FLAG_CURSOR_IMAGE
        : !hasPlayerDecoy
        ? DECOY_CURSOR_IMAGE
        : null
      : null;

  const displayTurnSeconds = Math.min(
    turnSecondsLeft,
    match?.turnDurationSeconds ?? settings.turnDurations[selectedDifficulty],
  );

  useEffect(() => {
    if (!revealPlacementCursorSrc) {
      setMousePosition((current) => ({ ...current, visible: false }));
      return undefined;
    }

    const handleMove = (event: MouseEvent) => {
      setMousePosition({
        x: event.clientX,
        y: event.clientY,
        visible: true,
      });
    };

    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, [revealPlacementCursorSrc]);

  useEffect(() => {
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = revealPlacementCursorSrc ? "none" : "";

    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [revealPlacementCursorSrc]);

  useAudio(match ? {
    phase,
    currentTurn: match.currentTurn,
    duel: match.duel,
    result: match.result,
    showDuel,
  } : null);

  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);
  const openFriendFlow = () => {
    setFriendIntent({ type: "invite" });
    if (!authSession) {
      setAuthPendingLabel("Sign in with Google to create your friend room and send the invite.");
      setAuthModalOpen(true);
    }
  };
  const openGoogleSignIn = () => {
    setFriendIntent(null);
    setAuthPendingLabel(
      authSession
        ? "Your Google account is already connected. You can sign in again if you want to switch accounts."
        : "Sign in with Google to unlock friend invites and multiplayer rooms.",
    );
    setAuthModalOpen(true);
  };
  const leaveFriendRoom = () => {
    setFriendRoomId(null);
    setFriendIntent(null);
    setAuthPendingLabel(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    }
  };

  const updateTurnDuration = (difficulty: "easy" | "medium" | "hard", value: number) => {
    setSettings((current) => ({
      ...current,
      turnDurations: {
        ...current.turnDurations,
        [difficulty]: clampTurnDuration(value),
      },
    }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_GAME_SETTINGS);
  };

  const settingsModal = (
    <SettingsModal
      open={settingsOpen}
      settings={settings}
      activeDifficulty={match?.difficulty ?? selectedDifficulty}
      onClose={closeSettings}
      onTurnDurationChange={updateTurnDuration}
      onMusicEnabledChange={(musicEnabled) => setSettings((current) => ({ ...current, musicEnabled }))}
      onMusicVolumeChange={(musicVolume) => setSettings((current) => ({ ...current, musicVolume: clampVolume(musicVolume) }))}
      onResetDefaults={resetSettings}
    />
  );
  const authModal = (
    <GoogleAuthModal
      open={authModalOpen}
      pendingLabel={authPendingLabel}
      onClose={() => setAuthModalOpen(false)}
      onAuthenticated={(session) => {
        setAuthSession(session);
        setAuthModalOpen(false);
      }}
    />
  );

  if (friendRoomId && authSession) {
    return (
      <>
        <div style={getBlurStyle(settingsOpen || authModalOpen)}>
          <FriendGameScreen
            session={authSession}
            roomId={friendRoomId}
            onLeaveRoom={leaveFriendRoom}
            onOpenSettings={openSettings}
          />
        </div>
        {settingsModal}
        {authModal}
      </>
    );
  }

  if (phase === "setup" || !match) {
    return (
      <>
        <div style={getBlurStyle(settingsOpen || authModalOpen)}>
          <StartScreen
            difficulties={difficulties}
            selected={selectedDifficulty}
            onSelect={setSelectedDifficulty}
            onStart={startMatch}
            onPlayWithFriends={openFriendFlow}
            onOpenGoogleSignIn={openGoogleSignIn}
            onOpenSettings={openSettings}
            loading={loading}
            friendLoading={friendLoading}
            authenticatedUser={authSession?.user ?? null}
          />
        </div>
        {settingsModal}
        {authModal}
      </>
    );
  }

  if (error) {
    return (
      <>
        <div style={getBlurStyle(settingsOpen)}>
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
              Error
            </div>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                color: "var(--color-text-muted)",
                maxWidth: "420px",
                textAlign: "center",
                fontSize: "0.88rem",
                lineHeight: "1.6",
              }}
            >
              {error}
            </div>
            <button
              type="button"
              onClick={resetToSetup}
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
        </div>
        {settingsModal}
      </>
    );
  }

  const statusMessage =
    phase === "repick"
      ? `Choose a new weapon - ${displayTurnSeconds}s`
      : uiPhase === "WAITING_FOR_PLAYER" && !selectedPieceId
      ? `Click one of your front red units to select it - ${displayTurnSeconds}s`
      : uiPhase === "WAITING_FOR_PLAYER" && selectedPieceId
      ? `Click a highlighted square or enemy unit to move - ${displayTurnSeconds}s`
      : uiPhase === "MOVING"
      ? "Moving..."
      : uiPhase === "BATTLE"
      ? "Duel in progress!"
      : phase === "reveal"
      ? hasPlayerFlag && hasPlayerDecoy
        ? `${REVEAL_READY_LABEL} - ${revealSecondsLeft}s`
        : hasPlayerFlag
        ? `${REVEAL_PICK_DECOY_LABEL} - ${revealSecondsLeft}s`
        : revealSecondsLeft > 0
        ? `${REVEAL_PICK_FLAG_LABEL} - ${revealSecondsLeft}s`
        : REVEAL_REQUIRED_LABEL
      : phase === "ai_turn"
      ? `AI is thinking... - ${displayTurnSeconds}s`
      : match.message || "Fog of war is active";

  return (
    <>
      <div style={getBlurStyle(settingsOpen)}>
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
              ref={layoutRef}
              style={{
                display: "flex",
                alignItems: "stretch",
                justifyContent: "center",
                flexWrap: "nowrap",
                gap: "clamp(8px, 1vw, 14px)",
                width: "fit-content",
                maxWidth: "none",
                transform: `scale(${gameScale})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
                <PlayerNameLabel name="AI SQUAD" team="ai" />

                <div style={{ position: "relative" }}>
                  <GameBoard
                    boardCells={boardCells}
                    selectedPieceId={selectedPieceId}
                    movingPieceId={movingPieceId}
                    draggingPieceId={draggingPieceId}
                    selectablePieceIds={selectablePieceIds}
                    validMoveSet={validMoveSet}
                    phase={phase}
                    dyingIds={dyingIds}
                    onPieceClick={onPieceClick}
                    onCellClick={onCellClick}
                    onRevealDragStart={onRevealDragStart}
                    onRevealDragEnd={onRevealDragEnd}
                    onRevealDrop={onRevealDrop}
                  />

                  {phase === "reveal" && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        padding: "4px",
                        background: "rgba(80,40,0,0.7)",
                        fontFamily: "var(--font-heading)",
                        fontSize: "0.78rem",
                        color: "var(--color-warning)",
                        textAlign: "center",
                        letterSpacing: "1.1px",
                        pointerEvents: "none",
                        animation: "pulse 1s ease infinite",
                      }}
                    >
                      MEMORIZE ENEMY WEAPONS - {revealSecondsLeft}s
                    </div>
                  )}

                  {phase === "ai_turn" && !showDuel && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        padding: "4px",
                        background: "rgba(0,0,60,0.7)",
                        fontFamily: "var(--font-heading)",
                        fontSize: "0.78rem",
                        color: "var(--color-label-cpu)",
                        textAlign: "center",
                        letterSpacing: "1.1px",
                        pointerEvents: "none",
                      }}
                    >
                      AI IS CHOOSING...
                    </div>
                  )}

                  {match.duel && (
                    <DuelOverlay
                      duel={match.duel}
                      visible={showDuel}
                      repick={phase === "repick"}
                      onRepick={submitRepick}
                    />
                  )}

                  {phase === "finished" && match.result && !showDuel && (
                    <GameOverScreen
                      result={match.result}
                      stats={match.stats}
                      difficulty={match.difficulty}
                      onPlayAgain={resetToSetup}
                    />
                  )}
                </div>

                <PlayerNameLabel name="YOUR SQUAD" team="player" />

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

                  {phase === "reveal" && hasPlayerFlag && hasPlayerDecoy && (
                    <button
                      type="button"
                      onClick={skipReveal}
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: "0.62rem",
                        padding: "3px 8px",
                        background: "rgba(255,215,0,0.15)",
                        color: "#FFD700",
                        border: "1px solid rgba(255,215,0,0.4)",
                        borderRadius: "9px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "var(--sidebar-width)" }}>
                <Sidebar
                  phase={phase}
                  revealTimer={revealSecondsLeft}
                  turnTimer={displayTurnSeconds}
                  stats={match.stats}
                  match={match}
                  difficulty={match.difficulty}
                  loading={loading}
                  onShufflePositions={shufflePlayerPieces}
                  onResetGame={resetMatch}
                  onBackToMenu={resetToSetup}
                  onOpenSettings={openSettings}
                />
              </div>
            </div>
          </div>

          {revealPlacementCursorSrc && mousePosition.visible && (
            <div
              aria-hidden="true"
              style={{
                position: "fixed",
                left: mousePosition.x,
                top: mousePosition.y,
                width: "34px",
                height: "34px",
                transform: "translate(-6px, -8px)",
                pointerEvents: "none",
                zIndex: 9,
                opacity: 0.96,
                filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.42))",
              }}
            >
              <img
                src={revealPlacementCursorSrc}
                alt=""
                draggable={false}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {settingsModal}
    </>
  );
}
