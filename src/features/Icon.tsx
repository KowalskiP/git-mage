import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Cloud,
  Command,
  Database,
  Download,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitPullRequest,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Tag,
  Terminal,
  UserRound,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRepos } from "../store/repos";
import { FANTASY_GLYPHS } from "./fantasyIcons";

export type IconName =
  | "fetch"
  | "pull"
  | "push"
  | "stash"
  | "palette"
  | "settings"
  | "terminal"
  | "add"
  | "close"
  | "branch"
  | "remote"
  | "tag"
  | "pr"
  | "worktree"
  | "submodule"
  | "agent"
  | "profile"
  | "folderOpen"
  | "gitflow"
  | "lfs"
  | "drawerOpen"
  | "drawerClosed";

const LUCIDE: Record<IconName, LucideIcon> = {
  fetch: Download,
  pull: ArrowDownToLine,
  push: ArrowUpFromLine,
  stash: Archive,
  palette: Command,
  settings: Settings,
  terminal: Terminal,
  add: Plus,
  close: X,
  branch: GitBranch,
  remote: Cloud,
  tag: Tag,
  pr: GitPullRequest,
  worktree: FolderTree,
  submodule: Package,
  agent: Bot,
  profile: UserRound,
  folderOpen: FolderOpen,
  gitflow: Workflow,
  lfs: Database,
  drawerOpen: PanelLeftClose,
  drawerClosed: PanelLeftOpen,
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

/**
 * One icon, two styles. "Modern" renders a Lucide line icon; "Fantasy" swaps in
 * a matching game-icons.net glyph (CC BY 3.0) where one exists, else falls back
 * to Lucide. Both use currentColor so they follow the theme.
 */
export function Icon({ name, size = 16, className }: Props) {
  const fantasy = useRepos((s) => s.appearance.iconTheme === "fantasy");
  const glyph = FANTASY_GLYPHS[name];
  if (fantasy && glyph) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="currentColor"
        className={className}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: glyph }}
      />
    );
  }
  const C = LUCIDE[name];
  return <C size={size} className={className} aria-hidden="true" />;
}
