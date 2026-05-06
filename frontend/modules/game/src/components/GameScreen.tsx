import { useGame } from "../hooks/useGame";
import { useAudio } from "../hooks/useAudio";

import { GameBoard } from "./GameBoard";
import { PlayerNameLabel } from "./PlayerNameLabel";
import { Sidebar } from "./Sidebar";
import { DuelOverlay } from "./DuelOverlay";
import { GameOverScreen } from "./GameOverScreen";
import { StartScreen } from "./StartScreen";
import { FallingLeavesBackground } from "./FallingLeavesBackground";
import { VideoBackground } from "./VideoBackground";

const GAME_BACKGROUND_OVERLAY = "linear-gradient(rgba(10, 14, 10, 0.64), rgba(10, 14, 10, 0.84))";

const REVEAL_PICK_FLAG_LABEL =
  "Shuffle your soldiers, then click one of them to choose your flag";
const REVEAL_FLAG_SELECTED_LABEL =
  "Flag selected. Memorize the enemy weapons";
const REVEAL_REQUIRED_LABEL =
  "Pick a flag to start the match";

export function GameScreen() {
  const {
    boardCells,
    match,
    phase,
    selectedPieceId,
    movingPieceId,
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
    shufflePlayerPieces,
    startMatch,
    resetMatch,
    resetToSetup,
    submitRepick,
    skipReveal,
    uiPhase,
  } = useGame();

  const hasPlayerFlag = !!match?.board.some(
    (piece) => piece.owner === "player" && piece.alive && piece.role === "flag",
  );
  const displayTurnSeconds = Math.min(turnSecondsLeft, match?.turnDurationSeconds ?? 10);

  useAudio(match ? {
    phase,
    currentTurn: match.currentTurn,
    duel: match.duel,
    result: match.result,
    showDuel,
  } : null);

  if (phase === "setup" || !match) {
    return (
      <StartScreen
        difficulties={difficulties}
        selected={selectedDifficulty}
        onSelect={setSelectedDifficulty}
        onStart={startMatch}
        loading={loading}
      />
    );
  }

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
      ? hasPlayerFlag
        ? `${REVEAL_FLAG_SELECTED_LABEL} - ${revealSecondsLeft}s`
        : revealSecondsLeft > 0
        ? `${REVEAL_PICK_FLAG_LABEL} - ${revealSecondsLeft}s`
        : REVEAL_REQUIRED_LABEL
      : phase === "ai_turn"
      ? `AI is thinking... - ${displayTurnSeconds}s`
      : match.message || "Fog of war is active";

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        backgroundColor: "var(--color-board-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(18px, 2vw, 28px)",
      }}
    >
      <VideoBackground overlay={GAME_BACKGROUND_OVERLAY} fit="contain" />
      <FallingLeavesBackground />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: "clamp(18px, 2vw, 30px)",
          width: "100%",
          maxWidth: "min(1360px, 100%)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
          <PlayerNameLabel name="AI SQUAD" team="ai" />

          <div style={{ position: "relative" }}>
            <GameBoard
              boardCells={boardCells}
              selectedPieceId={selectedPieceId}
              movingPieceId={movingPieceId}
              selectablePieceIds={selectablePieceIds}
              validMoveSet={validMoveSet}
              phase={phase}
              dyingIds={dyingIds}
              onPieceClick={onPieceClick}
              onCellClick={onCellClick}
            />

            {phase === "reveal" && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  padding: "7px",
                  background: "rgba(80,40,0,0.7)",
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.1rem",
                  color: "var(--color-warning)",
                  textAlign: "center",
                  letterSpacing: "2px",
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
                  padding: "7px",
                  background: "rgba(0,0,60,0.7)",
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.1rem",
                  color: "var(--color-label-cpu)",
                  textAlign: "center",
                  letterSpacing: "2px",
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
              marginTop: "12px",
              width: "100%",
              padding: "10px 18px",
              background: "rgba(0, 0, 0, 0.45)",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minHeight: "42px",
            }}
          >
            <span style={{ fontSize: "0.82rem", opacity: 0.5 }}>*</span>
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "0.84rem",
                color: "var(--color-text-muted)",
                flex: 1,
              }}
            >
              {statusMessage}
            </span>

            {phase === "reveal" && hasPlayerFlag && (
              <button
                type="button"
                onClick={skipReveal}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "0.74rem",
                  padding: "5px 12px",
                  background: "rgba(255,215,0,0.15)",
                  color: "#FFD700",
                  border: "1px solid rgba(255,215,0,0.4)",
                  borderRadius: "12px",
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
          />
        </div>
      </div>

    </div>
  );
}
