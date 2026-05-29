# Fonts

Drop the **Cinzel** display font here so the addon's headings/titles/kickers
match the web brand (aftertale.gg uses Cinzel for display type).

Required file:

- `Cinzel-Bold.ttf`

Source: <https://fonts.google.com/specimen/Cinzel> → *Get font* → *Download all*
→ grab the **static** `Cinzel-Bold.ttf` (not the variable-font file). SIL Open
Font License, so it's fine to bundle and ship.

`UI/Style.lua` points its display font at `Fonts/Cinzel-Bold.ttf` and falls
back to WoW's built-in font if the file is absent — so the addon never errors
on a missing font; it just looks less on-brand until the file is added.

Body text intentionally stays on WoW's default font (Cinzel is a display face
and gets hard to read at small sizes) — same display/body split as the web app.
