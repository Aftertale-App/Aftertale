// Generate the reusable "card" building blocks for the creative redesign:
//   card-white.png   rounded-rect WHITE fill (tint via SetGradient) - clean alpha
//   card-stroke.png  rounded-rect WHITE border (tint gold via SetVertexColor)
//   glow-soft.png    soft radial white->transparent (additive glow)
// All SVG-authored => true alpha transparency, so rounded corners read clean
// and there is no chroma key to bleed (no magenta).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const ART = path.join(__dirname, '..', '..', 'addon', 'Aftertale', 'Art', 'frame');

const SVGS = {
  'card-white.png':
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
       <rect x="2" y="2" width="252" height="252" rx="46" ry="46" fill="#ffffff"/>
     </svg>`,
  'card-stroke.png':
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
       <rect x="5" y="5" width="246" height="246" rx="43" ry="43" fill="none" stroke="#ffffff" stroke-width="3"/>
     </svg>`,
  'glow-soft.png':
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
       <defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
         <stop offset="0%"  stop-color="#ffffff" stop-opacity="1"/>
         <stop offset="55%" stop-color="#ffffff" stop-opacity="0.30"/>
         <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
       </radialGradient></defs>
       <rect width="256" height="256" fill="url(#g)"/>
     </svg>`,
  // external-link arrow (white, tint via SetVertexColor)
  'ext-arrow.png':
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
       <path d="M9 7 h8 v8 M17 7 L8 16" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
     </svg>`,
};

// Render at 1024px so even the large outer panels draw at/above display size
// (kills the upscale softness/grain). Glow stays soft so 512 is plenty.
for (const [name, svg] of Object.entries(SVGS)) {
  const px = name === 'glow-soft.png' ? 512 : (name === 'ext-arrow.png' ? 128 : 1024);
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: px }, background: 'rgba(0,0,0,0)' });
  fs.writeFileSync(path.join(ART, name), r.render().asPng());
  console.log('wrote', name, px + 'px');
}
console.log('done');
