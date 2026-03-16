import React from "react";

type LiveByFlashLogoProps = {
  size?: number;
  className?: string;
};

export default function LiveByFlashLogo({
  size = 40,
  className = "",
}: LiveByFlashLogoProps) {
  const gradientId = `lbf-vibrant-bg-${size}`;
  const glowId = `lbf-vibrant-glow-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Live by Flash logo"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#FF6B00" />
          <stop offset="100%" stopColor="#EA1D1D" />
        </radialGradient>

        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Red Background */}
      <rect x="8" y="8" width="112" height="112" rx="28" fill={`url(#${gradientId})`} />

      {/* Sharp Thick Seam Bolt */}
      <path
        d="M84 28 
           L34 70 
           H64 
           L44 100 
           L94 58 
           H64 
           Z"
        fill="#FFE600"
        filter={`url(#${glowId})`}
        stroke="white"
        strokeWidth="0.5"
      />

      {/* Nudged Circles: Moved 4px toward the center for better "pinning" */}
      {/* Top circle moved Left and Down */}
      <circle cx="80" cy="32" r="8.5" fill="#FFF3A0" filter={`url(#${glowId})`} />
      
      {/* Bottom circle moved Right and Up */}
      <circle cx="48" cy="96" r="8.5" fill="#FFD700" filter={`url(#${glowId})`} />
    </svg>
  );
}