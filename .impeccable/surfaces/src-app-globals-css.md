---
version: 1
slug: "src-app-globals-css"
primary_target: "src/app/globals.css"
related_targets: ["src/app/(dashboard)/dashboard-shell.tsx"]
---

## Direction contract

THESIS: The CRM stops looking like a generic dark-mode SaaS shadcn template
and becomes the daylight, tactile Brick N Papers world — plaster walls,
gold leaf, hand-blocked craft — rendered as a disciplined Operate-mode
system. It refuses the category-default "AI dashboard" look (near-black
surface, neon/violet accent, glowing edges) that the incumbent theme
currently is.

OWN-WORLD: Restrained color strategy — plaster neutrals (warm off-white
`plaster-50` ground, `plaster-900` ink) carry the surface; `gold-600`
(#A5813F) is the one accent, used the way the site itself uses it: on
primary actions, active nav state, focus rings, key numerics, and the
gold-gradient only on hero/emphasis moments, never drenched across the UI.
Display type is Cormorant Garamond (headings, module titles, empty-state
moments) with Cormorant SC for small caps labels/eyebrows; Inter carries
all body/UI/table/form text. Cards sit on `bg-raised` (#FFFFFF) above the
plaster ground with soft brown-tinted shadows (not neutral gray) and the
site's own `cubic-bezier(0.22,1,0.36,1)` ease. Corners stay the app's
existing shadcn radius scale (not the marketing site's — a dense data app
needs tighter, more consistent geometry than a hero page). Dark mode is
kept as a secondary, opt-in mode (existing toggle preserved) but re-themed
in the same plaster/gold family (plaster-900 ground, plaster-50 ink,
gold-500 accent) rather than the old neutral-gray/violet dark theme, so
switching modes never breaks brand.

STORY: An agent opens the CRM at the start of a shift and instantly reads
it as "our tool," not a downloaded template — the same warmth and craft
as bricknpapers.com, translated into fast, legible daily work: scanning
the inbox, moving pipeline cards, sending a broadcast, without the brand
ever slowing the task down.

FIRST VIEWPORT: The authenticated app shell — sidebar (logo mark at top,
Cormorant SC section labels, gold active-state pill) beside the primary
module (inbox by default), on the plaster ground, Inter throughout lists/
tables/cards, gold-600 for the single primary action per view.

FORM: Pinned direction (user-supplied brand evidence: bricknpapers.com
production CSS tokens + provided logo file), not a rolled concept — no
concept-seed key.

FINISH: unreviewed and undocumented is unfinished; this build ends with
the finish review, the verdict, DESIGN.md, and every shipping raster
carrying its provenance.
