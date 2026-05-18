"use client";

interface SidePickerIconProps {
  side: "white" | "black" | "random";
  size?: number;
}

export function SidePickerIcon({ side, size = 28 }: SidePickerIconProps) {
  switch (side) {
    case "white":
      return <WhitePiece size={size} />;
    case "black":
      return <BlackPiece size={size} />;
    case "random":
      return <RandomPiece size={size} />;
  }
}

function WhitePiece({ size }: { size: number }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id="wp" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FFF8E8" />
          <stop offset="100%" stopColor="#C8B88A" />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r} r={r - 1} fill="url(#wp)" stroke="#A89868" strokeWidth={1.2} />
    </svg>
  );
}

function BlackPiece({ size }: { size: number }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id="bp" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#4A4A4A" />
          <stop offset="100%" stopColor="#1A1A1A" />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r} r={r - 1} fill="url(#bp)" stroke="#333" strokeWidth={1.2} />
    </svg>
  );
}

function RandomPiece({ size }: { size: number }) {
  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id="rw" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FFF8E8" />
          <stop offset="100%" stopColor="#C8B88A" />
        </radialGradient>
        <radialGradient id="rb" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#4A4A4A" />
          <stop offset="100%" stopColor="#1A1A1A" />
        </radialGradient>
        <clipPath id="leftHalf">
          <rect x="0" y="0" width={half} height={size} />
        </clipPath>
        <clipPath id="rightHalf">
          <rect x={half} y="0" width={half} height={size} />
        </clipPath>
      </defs>
      <circle cx={half} cy={half} r={half - 1} fill="url(#rw)" clipPath="url(#leftHalf)" />
      <circle cx={half} cy={half} r={half - 1} fill="url(#rb)" clipPath="url(#rightHalf)" />
      <circle cx={half} cy={half} r={half - 1} fill="none" stroke="#777" strokeWidth={1.2} />
      <text
        x={half}
        y={half + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFF"
        fontSize={size * 0.38}
        fontWeight="bold"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
      >
        ?
      </text>
    </svg>
  );
}
