import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { App } from "./App";
import { fireTauriEvent } from "./test/setup";

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockImplementation((async (cmd: string) =>
    ["list_repos", "profiles_list", "agent_sessions", "detect_agents"].includes(cmd)
      ? []
      : undefined) as never);
});

describe("App", () => {
  it("shows the empty state with no repo open", async () => {
    render(<App />);
    expect(await screen.findByText("Open a repository to begin.")).toBeInTheDocument();
    expect(screen.getByText("Open repository")).toBeInTheDocument();
  });

  it("opens the Profiles panel from the native-menu event", async () => {
    render(<App />);
    await screen.findByText("Open a repository to begin.");

    act(() => fireTauriEvent("menu", "profiles"));

    await waitFor(() => expect(screen.getByText("Saved profiles")).toBeInTheDocument());
  });

  it("opens Settings from the native-menu event", async () => {
    render(<App />);
    await screen.findByText("Open a repository to begin.");

    act(() => fireTauriEvent("menu", "settings"));

    // Settings dialog title (en).
    await waitFor(() => expect(screen.getByText("Settings")).toBeInTheDocument());
  });
});
