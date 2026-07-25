#!/usr/bin/env python3
"""Generate the catadio app/DMG icon (telescope) as a PNG from an inline SVG."""
import cairosvg, sys

SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 1024
OUT = sys.argv[2] if len(sys.argv) > 2 else "build/icon.png"

SVG = """
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="warm" gradientUnits="userSpaceOnUse" x1="90" y1="440" x2="430" y2="90">
      <stop offset="0"   stop-color="#FF9A2E"/>
      <stop offset="0.45" stop-color="#FF5A3C"/>
      <stop offset="1"   stop-color="#EE3E8E"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#2A2230"/>
      <stop offset="1" stop-color="#141419"/>
    </radialGradient>
  </defs>

  <!-- dark rounded tile -->
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#glow)"/>

  <!-- tripod stand (world coords) -->
  <g fill="url(#warm)">
    <!-- legs -->
    <path d="M244 300 L196 452 a10 10 0 0 0 19 6 L262 306 Z"/>
    <path d="M268 300 L316 452 a10 10 0 0 1 -19 6 L250 306 Z"/>
    <!-- center post -->
    <rect x="245" y="286" width="22" height="70" rx="10"/>
    <!-- pivot -->
    <circle cx="256" cy="292" r="20"/>
  </g>

  <!-- telescope tube -->
  <g transform="translate(256 232) rotate(-34)" fill="url(#warm)">
    <!-- eyepiece -->
    <rect x="-182" y="-15" width="34" height="30" rx="9"/>
    <!-- main body -->
    <rect x="-156" y="-36" width="256" height="72" rx="26"/>
    <!-- focus ring -->
    <rect x="66" y="-42" width="20" height="84" rx="9"/>
    <!-- objective hood (flared front) -->
    <path d="M100 -36 L168 -54 L168 54 L100 36 Z"/>
    <!-- lens face -->
    <ellipse cx="168" cy="0" rx="15" ry="54"/>
  </g>
</svg>
"""

cairosvg.svg2png(bytestring=SVG.encode(), write_to=OUT,
                 output_width=SIZE, output_height=SIZE)
print(f"wrote {OUT} at {SIZE}x{SIZE}")
