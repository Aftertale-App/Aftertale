// Rasterize the line-art SVG icon set to PNGs and install them into the addon,
// overwriting the bronze illustrations in place (same filenames -> no Lua change).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const SVG = path.join(__dirname, 'icons-svg');
const ICONS = path.join(__dirname, '..', '..', 'addon', 'Aftertale', 'Art', 'icons');
const ART = path.join(__dirname, '..', '..', 'addon', 'Aftertale', 'Art');

// svg basename -> [ {dir,name,size}, ... ]
const MAP = [
  ['star',    [[ICONS,'moments.png',256],[ICONS,'level.png',256]]],
  ['clock',   [[ICONS,'time.png',256]]],
  ['compass', [[ICONS,'zones.png',256]]],
  ['scroll',  [[ICONS,'quests.png',256]]],
  ['shield',  [[ICONS,'feats.png',256]]],
  ['swords',  [[ICONS,'dungeons.png',256]]],
  ['archway', [[ICONS,'discoveries.png',256]]],
  ['chest',   [[ICONS,'items.png',256]]],
  ['sigil',   [[ART,'sigil-header.png',512]]],
];

for (const [base, outs] of MAP) {
  const svg = fs.readFileSync(path.join(SVG, base + '.svg'));
  for (const [dir, name, size] of outs) {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' });
    fs.writeFileSync(path.join(dir, name), resvg.render().asPng());
    console.log(`${base}.svg -> ${path.relative(path.join(__dirname,'..','..'), path.join(dir,name))} (${size}px)`);
  }
}
console.log('done');
