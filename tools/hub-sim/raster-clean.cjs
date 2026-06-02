// Rasterize the clean frame SVGs to addon PNGs at their native widths.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const HERE = __dirname;
const ART = path.join(HERE, '..', '..', 'addon', 'Aftertale', 'Art', 'frame');
const JOBS = [
  ['frame-clean.svg',       'frame-clean.png',       1418],
  ['inner-frame-clean.svg', 'inner-frame-clean.png', 1433],
  ['inner-cell-clean.svg',  'inner-cell-clean.png',  256],
];
for (const [svgName, pngName, w] of JOBS) {
  const svg = fs.readFileSync(path.join(HERE, svgName));
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: w }, background: 'rgba(0,0,0,0)' });
  fs.writeFileSync(path.join(ART, pngName), r.render().asPng());
  console.log(`${svgName} -> Art/frame/${pngName} (${w}px)`);
}
console.log('done');
