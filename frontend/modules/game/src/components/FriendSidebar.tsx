import type { CSSProperties } from "react";
import type { MatchView } from "@shared/types";

interface FriendSidebarProps {
  match: MatchView;
  playerName: string;
  opponentName: string;
  phaseLabel: string;
  turnTimer: number;
  loading: boolean;
  onOpenSettings: () => void;
  onBackToMenu: () => void;
}

const GLASS: CSSProperties = {
  background: "#1F231B",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: "10px",
};

export function FriendSidebar({
  match,
  playerName,
  opponentName,
  phaseLabel,
  turnTimer,
  loading,
  onOpenSettings,
  onBackToMenu,
}: FriendSidebarProps) {
  const aliveOpponent = match.board.filter((piece) => piece.owner === "ai" && piece.alive).length;
  const alivePlayer = match.board.filter((piece) => piece.owner === "player" && piece.alive).length;
  const phaseText = match.phase === "player_turn" ? `${phaseLabel} ${turnTimer}s` : phaseLabel;

  return (
    <div
      style={{
        width: "var(--sidebar-width)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        padding: "8px 6px",
        overflowY: "auto",
      }}
    >
      <img
        src="/game_logo_squad_rps.png"
        alt="Squad RPS"
        style={{ width: "82px", objectFit: "contain" }}
        onError={(event) => {
          (event.target as HTMLImageElement).style.display = "none";
        }}
      />

      <div style={{ ...GLASS, width: "100%", padding: "7px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <img
            src="/character_blue_front_nobg.png"
            alt="Friend"
            style={{ width: "30px", height: "30px", objectFit: "contain" }}
            onError={(event) => {
              (event.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.62rem",
                fontWeight: 700,
                color: "var(--color-label-cpu)",
                letterSpacing: "0.5px",
              }}
            >
              {opponentName}
            </div>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.5rem",
                fontWeight: 700,
                color: "#69C6FF",
                border: "1px solid rgba(105,198,255,0.48)",
                borderRadius: "3px",
                padding: "1px 5px",
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}
            >
              Friend Match
            </span>
          </div>
          <button
            type="button"
            title="Settings"
            aria-label="Open settings"
            onClick={onOpenSettings}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              fontSize: "0.8rem",
              padding: "2px",
              lineHeight: 1,
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.6rem",
          fontWeight: 700,
          color: match.phase === "player_turn" ? "#44DD66" : match.phase === "ai_turn" ? "#69C6FF" : "#FFAA22",
          letterSpacing: "0.9px",
          padding: "3px 8px",
          background: "rgba(0,0,0,0.4)",
          borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {phaseText}
      </div>

      <div style={{ ...GLASS, width: "100%", padding: "7px 8px" }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.5rem",
            color: "var(--color-text-muted)",
            letterSpacing: "1.5px",
            textAlign: "center",
            marginBottom: "4px",
          }}
        >
          UNITS REMAINING
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, color: "var(--color-label-cpu)", lineHeight: 1 }}>
              {aliveOpponent}
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.45rem", color: "var(--color-text-muted)", marginTop: "1px" }}>
              FRIEND
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.64rem", color: "rgba(255,255,255,0.2)" }}>vs</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, color: "var(--color-label-player)", lineHeight: 1 }}>
              {alivePlayer}
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.45rem", color: "var(--color-text-muted)", marginTop: "1px" }}>
              YOU
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...GLASS, width: "100%", padding: "7px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "0.56rem", fontWeight: 700, color: "var(--color-label-cpu)" }}>
            {opponentName}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--color-label-cpu)" }}>
            {aliveOpponent}/14
          </span>
        </div>
        <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden", marginBottom: "6px" }}>
          <div style={{ height: "100%", width: `${(aliveOpponent / 14) * 100}%`, background: "var(--color-label-cpu)", borderRadius: "2px" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "0.56rem", fontWeight: 700, color: "var(--color-label-player)" }}>
            {playerName}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--color-label-player)" }}>
            {alivePlayer}/14
          </span>
        </div>
        <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(alivePlayer / 14) * 100}%`, background: "var(--color-label-player)", borderRadius: "2px" }} />
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "5px" }}>
        <button
          type="button"
          onClick={onBackToMenu}
          disabled={loading}
          style={{
            width: "100%",
            fontFamily: "var(--font-body)",
            fontSize: "0.62rem",
            fontWeight: 700,
            padding: "7px 9px",
            background: "rgba(255,255,255,0.08)",
            color: "var(--color-text)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "9px",
            cursor: loading ? "wait" : "pointer",
            letterSpacing: "0.4px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            opacity: loading ? 0.72 : 1,
          }}
        >
          Back To Main Menu
        </button>
      </div>
    </div>
  );
}
