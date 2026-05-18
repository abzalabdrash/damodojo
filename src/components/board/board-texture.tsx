/**
 * Board-wide wood grain & lighting overlay. Sits between the cell grid and
 * the pieces layer. Uses SVG feTurbulence for organic grain that doesn't
 * tile, plus blending so it darkens dark squares and lifts highlights on
 * light squares. CSS mix-blend mode 'overlay' does the magic per-square.
 */
export function BoardTexture() {
  return (
    <>
      {/* Grain layer: dark stretched horizontal noise (looks like wood). */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
        style={{ mixBlendMode: "overlay", opacity: 0.55 }}
      >
        <defs>
          <filter id="boardGrain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.06 2.4"
              numOctaves="3"
              seed="11"
            />
            <feColorMatrix
              values="0 0 0 0 0.42  0 0 0 0 0.30  0 0 0 0 0.18  0 0 0 1 0"
            />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.45" />
            </feComponentTransfer>
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#boardGrain)" />
      </svg>

      {/* Fine grain detail — sharper. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
        style={{ mixBlendMode: "soft-light", opacity: 0.5 }}
      >
        <defs>
          <filter id="boardGrainFine">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.18 5.6"
              numOctaves="2"
              seed="3"
            />
            <feColorMatrix
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0"
            />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#boardGrainFine)" />
      </svg>

      {/* Ambient lighting — warm top-left, cool bottom-right. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 18% -8%, rgba(255, 230, 180, 0.18), transparent 56%), radial-gradient(120% 100% at 100% 110%, rgba(8, 4, 0, 0.30), transparent 60%)",
          mixBlendMode: "soft-light",
        }}
      />

      {/* Inner vignette to seat the board into the frame. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow:
            "inset 0 0 60px 0 rgba(0,0,0,0.45), inset 0 2px 1px 0 rgba(255,235,200,0.18), inset 0 -4px 12px 0 rgba(0,0,0,0.4)",
        }}
      />
    </>
  );
}
