// One-shot signal: "begin the bring-to-life ceremony on the next captured hero
// shown." Set by Meet Your Heroes' Start CTA, consumed by ChronicleReader once
// the hero's bible + sessions have loaded — so Start launches the reveal
// directly instead of dropping the player on the cold-reveal skeleton first.

let pending = false;

export function requestBringToLife(): void {
  pending = true;
}

export function consumeBringToLife(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}
