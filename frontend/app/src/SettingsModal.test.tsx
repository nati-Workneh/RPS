import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "@game/components/SettingsModal";

describe("SettingsModal", () => {
  it("should render controls and dispatch actions", () => {
    const onClose = vi.fn();
    const onTurnDurationChange = vi.fn();
    const onMusicEnabledChange = vi.fn();
    const onMusicVolumeChange = vi.fn();
    const onResetDefaults = vi.fn();

    render(
      <SettingsModal
        open
        activeDifficulty="medium"
        settings={{
          turnDurations: {
            easy: 30,
            medium: 15,
            hard: 10,
          },
          musicEnabled: true,
          musicVolume: 72,
        }}
        onClose={onClose}
        onTurnDurationChange={onTurnDurationChange}
        onMusicEnabledChange={onMusicEnabledChange}
        onMusicVolumeChange={onMusicVolumeChange}
        onResetDefaults={onResetDefaults}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Game Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    fireEvent.click(screen.getByRole("switch", { name: "Music enabled" }));
    fireEvent.change(screen.getByLabelText("Music volume"), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText("Easy turn time"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Restore Defaults" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onMusicEnabledChange).toHaveBeenCalledWith(false);
    expect(onMusicVolumeChange).toHaveBeenCalledWith(64);
    expect(onTurnDurationChange).toHaveBeenCalledWith("easy", 45);
    expect(onResetDefaults).toHaveBeenCalledTimes(1);
  });
});
