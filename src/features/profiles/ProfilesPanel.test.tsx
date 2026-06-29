import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useRepos } from "../../store/repos";
import { ProfilesPanel } from "./ProfilesPanel";
import type { Profile, RepoMeta } from "../../types/git";

const invokeMock = vi.mocked(invoke);

const repo: RepoMeta = {
  id: 1,
  path: "/tmp/r",
  name: "r",
  alias: null,
  favorite: false,
  lastOpened: 0,
};

const profile: Profile = {
  id: 7,
  name: "Work",
  userName: "Work Bot",
  userEmail: "work@example.com",
  signingKey: "",
  signingFormat: "",
  sshKeyPath: "",
};

beforeEach(() => {
  invokeMock.mockImplementation((async () => undefined) as never);
});

describe("ProfilesPanel", () => {
  it("is hidden until opened", () => {
    render(<ProfilesPanel />);
    expect(screen.queryByText("Saved profiles")).not.toBeInTheDocument();
  });

  it("lists saved profiles and applies one locally", async () => {
    useRepos.setState({ profilesOpen: true, selected: repo, profiles: [profile] });
    render(<ProfilesPanel />);

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText(/Work Bot/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Apply"));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("profile_apply", {
        path: "/tmp/r",
        profile,
        global: false,
      }),
    );
  });

  it("applies a profile globally", async () => {
    useRepos.setState({ profilesOpen: true, selected: repo, profiles: [profile] });
    render(<ProfilesPanel />);

    fireEvent.click(screen.getByText("Global"));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("profile_apply", {
        path: "/tmp/r",
        profile,
        global: true,
      }),
    );
  });

  it("creates a new profile via the editor", async () => {
    useRepos.setState({ profilesOpen: true, selected: repo, profiles: [] });
    render(<ProfilesPanel />);

    fireEvent.click(screen.getByText("+ New profile"));
    fireEvent.change(screen.getByPlaceholderText("Profile name (e.g. Work)"), {
      target: { value: "Personal" },
    });
    fireEvent.change(screen.getByPlaceholderText("user.name"), { target: { value: "Me" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "profile_save",
        expect.objectContaining({
          profile: expect.objectContaining({ id: 0, name: "Personal", userName: "Me" }),
        }),
      ),
    );
  });
});
