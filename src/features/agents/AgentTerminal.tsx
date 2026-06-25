import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { agentBuffer, agentResize, agentWrite } from "../../ipc/commands";

export function AgentTerminal({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

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

    const sync = () => {
      try {
        fit.fit();
      } catch {
        /* host not measured yet */
      }
      agentResize(sessionId, term.rows, term.cols).catch(() => {});
    };
    sync();

    const onData = term.onData((d) => agentWrite(sessionId, d).catch(() => {}));
    const ro = new ResizeObserver(sync);
    ro.observe(host);

    let disposed = false;
    let unOut: Promise<() => void> | null = null;
    let unExit: Promise<() => void> | null = null;
    const attach = () => {
      unOut = listen<{ id: string; data: string }>("agent:output", (e) => {
        if (e.payload.id === sessionId) term.write(e.payload.data);
      });
      unExit = listen<string>("agent:exited", (e) => {
        if (e.payload === sessionId) term.write("\r\n\x1b[2m— process exited —\x1b[0m\r\n");
      });
    };

    // Prime with captured scrollback, then attach the live stream.
    agentBuffer(sessionId)
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
    };
  }, [sessionId]);

  return <div className="agent-term" ref={hostRef} />;
}
