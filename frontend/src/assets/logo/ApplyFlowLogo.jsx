import React, { useId } from 'react';

export function ApplyFlowLogo({ className = 'h-9', variant = 'dark', showText = true }) {
  const uid = useId().replace(/:/g, '');
  const blueGradId = `af-blue-grad-${uid}`;
  const orangeGradId = `af-orange-grad-${uid}`;
  const glowId = `af-glow-${uid}`;

  // variant: 'dark' (for dark navy background), 'light' (for light surface)
  const textColor = variant === 'dark' ? '#FFFFFF' : '#081226';
  const subtextColor = variant === 'dark' ? '#94A3B8' : '#64748B';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Dynamic Geometric Brand Mark */}
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0 transition-transform duration-200 hover:scale-105"
      >
        <defs>
          <linearGradient id={blueGradId} x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3B82F6" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id={orangeGradId} x1="14" y1="4" x2="32" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FB923C" />
            <stop offset="1" stopColor="#EA580C" />
          </linearGradient>
          <filter id={glowId} x="0" y="0" width="34" height="34" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#2563EB" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Outer squircle base */}
        <rect width="34" height="34" rx="10" fill="#081226" />
        <rect x="0.75" y="0.75" width="32.5" height="32.5" rx="9.25" stroke="#1E2E4E" strokeWidth="1.5" />

        {/* Forward kinetic arrows representing rapid candidate placement */}
        <path
          d="M8.5 24L16.5 9.5L20.5 16.5L14.5 24H8.5Z"
          fill={`url(#${blueGradId})`}
        />
        <path
          d="M16 24.5L21.5 14L26 24.5H16Z"
          fill={`url(#${orangeGradId})`}
        />
        <circle cx="21" cy="10" r="2.2" fill="#F97316" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center tracking-tight font-display">
            <span className="font-extrabold text-[18px] tracking-tight" style={{ color: textColor }}>
              Apply
            </span>
            <span className="font-extrabold text-[18px] tracking-tight text-[#2563EB] drop-shadow-[0_0_12px_rgba(37,99,235,0.25)]">
              Flow
            </span>
            <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest uppercase rounded bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30 shadow-[0_0_8px_rgba(249,115,22,0.15)]">
              ATS
            </span>
          </div>
          <span className="text-[10px] font-semibold tracking-wider uppercase mt-0.5" style={{ color: subtextColor }}>
            Careers Workspace
          </span>
        </div>
      )}
    </div>
  );
}

export default ApplyFlowLogo;
