import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { terminalBuffer, terminalResize, terminalWrite } from "../../ipc/commands";

/**
 * A generic xterm bound to one backend pty session via the `term:*` events.
 * `visible` drives a re-fit when the dock or tab is shown (xterm can't measure
 * a `display:none` host).
 */
export function TermView({ sessionId, visible }: { sessionId: string; visible: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontSize: 12,
      fontFamily: "ui-monospace, Menlo, monospace",
      cursorBlink: true,
      theme: { background: "#16181d", foreground: "#d7dae0" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    const sync = () => {
      try {
        fit.fit();
      } catch {
        /* host not measured yet */
      }
      terminalResize(sessionId, term.rows, term.cols).catch(() => {});
    };
    sync();

    const onData = term.onData((d) => terminalWrite(sessionId, d).catch(() => {}));
    const ro = new ResizeObserver(sync);
    ro.observe(host);

    let disposed = false;
    let unOut: Promise<() => void> | null = null;
    let unExit: Promise<() => void> | null = null;
    const attach = () => {
      unOut = listen<{ id: string; data: string }>("term:output", (e) => {
        if (e.payload.id === sessionId) term.write(e.payload.data);
      });
      unExit = listen<string>("term:exited", (e) => {
        if (e.payload === sessionId) term.write("\r\n\x1b[2m— shell exited —\x1b[0m\r\n");
      });
    };

    // Prime with captured scrollback, then attach the live stream.
    terminalBuffer(sessionId)
      .then((b) => {
        if (disposed) return;
        if (b) term.write(b);
        attach();
      })
      .catch(() => {
        if (!disposed) attach();
      });

    return () => {
      disposed = true;
      onData.dispose();
      ro.disconnect();
      unOut?.then((f) => f());
      unExit?.then((f) => f());
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Re-fit and focus when this tab/dock becomes visible.
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* not measured */
      }
      const t = termRef.current;
      if (t) {
        terminalResize(sessionId, t.rows, t.cols).catch(() => {});
        t.focus();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [visible, sessionId]);

  return <div className="term-host" ref={hostRef} />;
}
