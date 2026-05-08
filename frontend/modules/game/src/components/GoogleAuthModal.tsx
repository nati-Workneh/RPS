import { useEffect, useRef, useState } from "react";
import { loginWithGoogle, type AuthSession } from "../api/friendApi";

interface GoogleAuthModalProps {
  open: boolean;
  pendingLabel?: string | null;
  onClose: () => void;
  onAuthenticated: (session: AuthSession) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, string | number | boolean>,
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function GoogleAuthModal({ open, pendingLabel, onClose, onAuthenticated }: GoogleAuthModalProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Sign in with Google to create or join a friend match.");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const container = buttonRef.current;
    if (!container) return undefined;

    container.innerHTML = "";
    setError(null);

    if (!GOOGLE_CLIENT_ID) {
      setStatus("Missing VITE_GOOGLE_CLIENT_ID. Add your Google client id to the frontend env file.");
      return undefined;
    }

    const renderGoogleButton = () => {
      if (cancelled || !buttonRef.current) return;

      if (!window.google?.accounts?.id) {
        window.setTimeout(renderGoogleButton, 250);
        setStatus("Loading Google sign-in...");
        return;
      }

      setStatus("Use your Google account to continue.");
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setSubmitting(true);
          setError(null);
          setStatus("Signing you in...");
          try {
            const session = await loginWithGoogle(credential);
            if (!cancelled) {
              onAuthenticated(session);
            }
          } catch (cause) {
            if (!cancelled) {
              setError(cause instanceof Error ? cause.message : "Google sign-in failed.");
              setStatus("Try signing in again.");
            }
          } finally {
            if (!cancelled) {
              setSubmitting(false);
            }
          }
        },
      });

      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 320,
        text: "continue_with",
      });
    };

    renderGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [open, onAuthenticated]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Google sign in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "rgba(4, 8, 6, 0.62)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(440px, calc(100vw - 32px))",
          borderRadius: "26px",
          padding: "28px 24px 24px",
          background: "linear-gradient(180deg, rgba(15,22,18,0.96), rgba(8,12,9,0.96))",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.44)",
          color: "#F7F9F3",
        }}
      >
        <button
          type="button"
          aria-label="Close Google sign in"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "36px",
            height: "36px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            color: "#F7F9F3",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          X
        </button>

        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.5rem",
            letterSpacing: "0.04em",
            marginBottom: "8px",
            color: "#F4D377",
          }}
        >
          Play With Friends
        </div>

        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "0.95rem",
            lineHeight: "1.6",
            color: "rgba(247,249,243,0.82)",
            marginBottom: "18px",
          }}
        >
          {pendingLabel ?? "Google sign-in lets us create your player identity and connect both friends to the same match room."}
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: "18px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "0.86rem",
              color: "rgba(247,249,243,0.72)",
              marginBottom: "14px",
            }}
          >
            {status}
          </div>

          <div
            ref={buttonRef}
            style={{
              minHeight: "44px",
              display: "flex",
              justifyContent: "center",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "0.84rem",
              lineHeight: "1.55",
              color: "#FFB5B5",
              marginBottom: "12px",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "0.74rem",
            lineHeight: "1.5",
            color: "rgba(247,249,243,0.56)",
          }}
        >
          {submitting
            ? "Finalizing your Google session..."
            : "After sign-in, we will create or join the friend room automatically."}
        </div>
      </div>
    </div>
  );
}
