import { FANTASY_GLYPHS } from "./fantasyIcons";

/**
 * GitMage mark: a wizard hat (game-icons.net "pointy-hat", CC BY 3.0) on the
 * purple accent. Always this glyph regardless of the icon-theme setting — it's
 * the brand, not a swappable UI icon. Matches src-tauri/icons (same source SVG).
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-label="GitMage" role="img">
      <defs>
        <linearGradient id="gm-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#gm-logo-grad)" />
      <g
        fill="#fff"
        transform="translate(96 96) scale(0.625)"
        dangerouslySetInnerHTML={{ __html: FANTASY_GLYPHS.logo }}
      />
    </svg>
  );
}
