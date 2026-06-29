import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useRepos } from "../store/repos";
import { DEFAULT_APPEARANCE } from "../theme";
import { Icon } from "./Icon";

const viewBox = (el: HTMLElement) => el.querySelector("svg")?.getAttribute("viewBox");

describe("Icon", () => {
  it("renders a Lucide (24-grid) icon in modern mode", () => {
    useRepos.setState({ appearance: { ...DEFAULT_APPEARANCE, iconTheme: "lucide" } });
    const { container } = render(<Icon name="stash" />);
    expect(viewBox(container)).toBe("0 0 24 24");
  });

  it("renders a game-icons (512 grid) glyph in fantasy mode", () => {
    useRepos.setState({ appearance: { ...DEFAULT_APPEARANCE, iconTheme: "fantasy" } });
    const { container } = render(<Icon name="stash" />);
    expect(viewBox(container)).toBe("0 0 512 512");
    expect(container.querySelector("svg")?.innerHTML).toContain("<path");
  });

  it("falls back to Lucide in fantasy mode when no glyph exists", () => {
    useRepos.setState({ appearance: { ...DEFAULT_APPEARANCE, iconTheme: "fantasy" } });
    const { container } = render(<Icon name="drawerOpen" />);
    expect(viewBox(container)).toBe("0 0 24 24");
  });
});
