import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { Difficulty } from "@shared/types";

export interface GameSettingsState {
  turnDurations: Record<Difficulty, number>;
  musicEnabled: boolean;
  musicVolume: number;
}

interface SettingsModalProps {
  open: boolean;
  settings: GameSettingsState;
  activeDifficulty: Difficulty;
  onClose: () => void;
  onTurnDurationChange: (difficulty: Difficulty, value: number) => void;
  onMusicEnabledChange: (enabled: boolean) => void;
  onMusicVolumeChange: (volume: number) => void;
  onResetDefaults: () => void;
}

const MODAL_CARD: CSSProperties = {
  position: "relative",
  width: "min(660px, calc(100vw - 20px))",
  maxHeight: "min(590px, calc(100vh - 20px))",
  overflowY: "auto",
  borderRadius: "24px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: [
    "radial-gradient(circle at top left, rgba(245, 214, 122, 0.14), transparent 32%)",
    "linear-gradient(180deg, rgba(18,24,18,0.96), rgba(10,14,10,0.92))",
  ].join(", "),
  boxShadow: "0 36px 110px rgba(0,0,0,0.58)",
  backdropFilter: "blur(18px)",
};

const SECTION_CARD: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
};

const DIFFICULTY_META: Record<Difficulty, { label: string; color: string; glow: string }> = {
  easy: { label: "Easy", color: "#7CFF70", glow: "rgba(124,255,112,0.18)" },
  medium: { label: "Medium", color: "#FFC35B", glow: "rgba(255,195,91,0.18)" },
  hard: { label: "Hard", color: "#FF7D7D", glow: "rgba(255,125,125,0.18)" },
};

const ORDERED_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function clampSeconds(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(120, Math.max(5, Math.round(value)));
}

function stepperButtonStyle(): CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.06)",
    color: "#F7FBF3",
    fontSize: "0.95rem",
    lineHeight: 1,
    cursor: "pointer",
  };
}

export function SettingsModal({
  open,
  settings,
  activeDifficulty,
  onClose,
  onTurnDurationChange,
  onMusicEnabledChange,
  onMusicVolumeChange,
  onResetDefaults,
}: SettingsModalProps) {
  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 10px",
        background: "rgba(4, 7, 5, 0.54)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div style={MODAL_CARD}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "36px",
            height: "36px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "#F5F7F1",
            fontSize: "1rem",
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
          }}
        >
          X
        </button>

        <div style={{ padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ paddingRight: "42px" }}>
            <div
              id="settings-modal-title"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.35rem, 2.3vw, 1.8rem)",
                color: "#F7F4E7",
                letterSpacing: "0.05em",
              }}
            >
              Game Settings
            </div>
            <div
              style={{
                marginTop: "6px",
                fontFamily: "var(--font-ui)",
                fontSize: "0.82rem",
                lineHeight: 1.45,
                color: "rgba(240, 244, 236, 0.78)",
                maxWidth: "500px",
              }}
            >
              Tune the soundtrack and customize the turn timer for every difficulty.
              Changes save instantly and the active match updates right away.
            </div>
          </div>

          <section style={{ ...SECTION_CARD, padding: "14px 14px 12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "0.96rem",
                    color: "#F6D880",
                    letterSpacing: "0.04em",
                  }}
                >
                  Music
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.76rem",
                    color: "rgba(240,244,236,0.7)",
                  }}
                >
                  Mute the theme or lower its volume without affecting the rest of the UI.
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.musicEnabled}
                aria-label="Music enabled"
                onClick={() => onMusicEnabledChange(!settings.musicEnabled)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "7px 10px",
                  borderRadius: "999px",
                  border: `1px solid ${settings.musicEnabled ? "rgba(122,255,112,0.28)" : "rgba(255,255,255,0.12)"}`,
                  background: settings.musicEnabled ? "rgba(122,255,112,0.12)" : "rgba(255,255,255,0.05)",
                  color: "#F5F7F1",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.76rem",
                    letterSpacing: "0.04em",
                  }}
                >
                  {settings.musicEnabled ? "Music On" : "Music Off"}
                </span>
                <span
                  style={{
                    position: "relative",
                    width: "40px",
                    height: "22px",
                    borderRadius: "999px",
                    background: settings.musicEnabled ? "rgba(124,255,112,0.55)" : "rgba(255,255,255,0.14)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "3px",
                      left: settings.musicEnabled ? "21px" : "3px",
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: "#F8FDF3",
                      boxShadow: "0 6px 14px rgba(0,0,0,0.32)",
                      transition: "left 160ms ease",
                    }}
                  />
                </span>
              </button>
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <label htmlFor="music-volume" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.76rem",
                    letterSpacing: "0.04em",
                    color: "#F4F6EF",
                  }}
                >
                  Music Volume
                </span>
                <input
                  id="music-volume"
                  aria-label="Music volume"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!settings.musicEnabled}
                  value={settings.musicVolume}
                  onChange={(event) => onMusicVolumeChange(Number(event.currentTarget.value))}
                  style={{
                    width: "100%",
                    accentColor: settings.musicEnabled ? "#8FFF68" : "#7A8475",
                    cursor: settings.musicEnabled ? "pointer" : "not-allowed",
                    opacity: settings.musicEnabled ? 1 : 0.45,
                  }}
                />
              </label>

              <div
                style={{
                  minWidth: "70px",
                  height: "56px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.06rem", color: "#F7FFF2", fontWeight: 700 }}>
                  {settings.musicEnabled ? `${settings.musicVolume}%` : "OFF"}
                </span>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.5rem", letterSpacing: "0.12em", color: "rgba(240,244,236,0.58)" }}>
                  LEVEL
                </span>
              </div>
            </div>
          </section>

          <section style={{ ...SECTION_CARD, padding: "14px" }}>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "0.96rem",
                color: "#F6D880",
                letterSpacing: "0.04em",
              }}
            >
              Turn Timer
            </div>
            <div
              style={{
                marginTop: "4px",
                fontFamily: "var(--font-ui)",
                fontSize: "0.76rem",
                color: "rgba(240,244,236,0.7)",
              }}
            >
              Set a custom turn length for each difficulty. Values are measured in seconds.
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "10px",
              }}
            >
              {ORDERED_DIFFICULTIES.map((difficulty) => {
                const meta = DIFFICULTY_META[difficulty];
                const isActive = activeDifficulty === difficulty;
                const seconds = settings.turnDurations[difficulty];

                return (
                  <div
                    key={difficulty}
                    style={{
                      borderRadius: "16px",
                      padding: "10px 10px 10px 12px",
                      border: `1px solid ${isActive ? meta.color : "rgba(255,255,255,0.08)"}`,
                      background: isActive
                        ? `linear-gradient(180deg, ${meta.glow}, rgba(255,255,255,0.03))`
                        : "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-heading)",
                            fontSize: "0.88rem",
                            color: meta.color,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {meta.label}
                        </span>
                        {isActive && (
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: "999px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              fontFamily: "var(--font-ui)",
                              fontSize: "0.62rem",
                              letterSpacing: "0.08em",
                              color: "rgba(245,247,241,0.82)",
                              textTransform: "uppercase",
                            }}
                          >
                            Active
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: "4px",
                          fontFamily: "var(--font-ui)",
                          fontSize: "0.72rem",
                          color: "rgba(240,244,236,0.68)",
                        }}
                      >
                        Recommended range: 5 to 120 seconds.
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        type="button"
                        aria-label={`${meta.label} minus one second`}
                        onClick={() => onTurnDurationChange(difficulty, clampSeconds(seconds - 1))}
                        style={stepperButtonStyle()}
                      >
                        -
                      </button>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          padding: "8px 10px",
                          borderRadius: "14px",
                          background: "rgba(4,7,5,0.34)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          flex: 1,
                        }}
                      >
                        <input
                          aria-label={`${meta.label} turn time`}
                          type="number"
                          min={5}
                          max={120}
                          step={1}
                          value={seconds}
                          onChange={(event) => onTurnDurationChange(difficulty, Number(event.currentTarget.value))}
                          style={{
                            width: "48px",
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            color: "#F7FBF3",
                            textAlign: "right",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.96rem",
                            fontWeight: 700,
                          }}
                        />
                        <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.68rem", color: "rgba(240,244,236,0.72)" }}>
                          sec
                        </span>
                      </label>

                      <button
                        type="button"
                        aria-label={`${meta.label} plus one second`}
                        onClick={() => onTurnDurationChange(difficulty, clampSeconds(seconds + 1))}
                        style={stepperButtonStyle()}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "0.76rem",
                color: "rgba(240,244,236,0.72)",
                lineHeight: 1.45,
              }}
            >
              Changes are saved automatically. Use the close button when you are done.
            </div>

            <button
              type="button"
              onClick={onResetDefaults}
              style={{
                padding: "8px 12px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#F6F8F3",
                fontFamily: "var(--font-ui)",
                fontSize: "0.76rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              Restore Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
