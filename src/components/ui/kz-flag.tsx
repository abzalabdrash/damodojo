"use client";

interface KzFlagProps {
  className?: string;
  size?: number;
}

/**
 * Simplified SVG Kazakhstan flag: turquoise field, golden sun, golden eagle,
 * golden ornament stripe on hoist side.
 */
export function KzFlag({ className, size = 16 }: KzFlagProps) {
  const h = Math.round(size * 0.6);
  return (
    <svg
      viewBox="0 0 30 18"
      width={size}
      height={h}
      className={className}
      aria-label="KZ"
      role="img"
    >
      {/* sky-blue field */}
      <rect width={30} height={18} rx={2} fill="#00AFCA" />
      {/* golden sun */}
      <circle cx={15} cy={8} r={3.2} fill="#FFD700" />
      {/* simple rays */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const x1 = 15 + Math.cos(angle) * 3.8;
        const y1 = 8 + Math.sin(angle) * 3.8;
        const x2 = 15 + Math.cos(angle) * 5;
        const y2 = 8 + Math.sin(angle) * 5;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#FFD700"
            strokeWidth={0.5}
          />
        );
      })}
      {/* eagle silhouette (simplified) */}
      <path
        d="M12.2 7.3c.5-1.2 1.3-2 2.8-2s2.3.8 2.8 2c-.6.3-1.4.5-2.8.5s-2.2-.2-2.8-.5z"
        fill="#FFD700"
        opacity={0.85}
      />
      {/* hoist ornament stripe */}
      <rect x={0} y={0} width={2.5} height={18} fill="#FFD700" opacity={0.7} rx={0} />
      <line x1={1.25} y1={0} x2={1.25} y2={18} stroke="#00AFCA" strokeWidth={0.5} />
    </svg>
  );
}
