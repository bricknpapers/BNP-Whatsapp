---
name: Brick N Papers WhatsApp CRM
description: The daylight, plaster-and-gold-leaf Operate-mode system for Brick N Papers' internal WhatsApp CRM.
colors:
  gold-700: "#8A6A2C"
  gold-600: "#A5813F"
  gold-400: "#C9A94E"
  plaster-50: "#FBF8F3"
  plaster-100: "#F5EFE4"
  plaster-200: "#ECE3D2"
  plaster-300: "#D9CCB3"
  plaster-600: "#635947"
  plaster-800: "#2B2620"
  plaster-900: "#1A1612"
  card-raised: "#FFFFFF"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontWeight: 500
    lineHeight: 1.3
  caps:
    fontFamily: "Cormorant SC, Cormorant Garamond, serif"
    fontWeight: 600
    letterSpacing: "0.02em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "calc(0.625rem * 0.6)"
  md: "calc(0.625rem * 0.8)"
  lg: "0.625rem"
  xl: "calc(0.625rem * 1.4)"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.gold-700}"
    textColor: "{colors.plaster-50}"
    rounded: "{rounded.md}"
    height: "2rem"
    padding: "0 0.625rem"
  button-primary-hover:
    backgroundColor: "{colors.gold-600}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.plaster-900}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "transparent"
    rounded: "{rounded.md}"
    height: "2rem"
  card:
    backgroundColor: "{colors.card-raised}"
    rounded: "{rounded.xl}"
    padding: "1rem"
---

# Design System: Brick N Papers WhatsApp CRM

## Overview

**Creative North Star: "The Plaster Workroom"**

Brick N Papers' internal CRM is the daylight back room of a craft studio, not a downloaded SaaS shell: warm plaster walls, one disciplined gold accent, and a serif that belongs to the brand rather than a system default. The system is pulled directly from bricknpapers.com's shipped production tokens — the same `--gold-*`/`--plaster-*` scales, the same Cormorant/Inter pairing, the same brown-tinted shadow recipe — re-proven for a dense, daily-use Operate-mode tool rather than a marketing page. Nothing here is a stylistic impression of the brand; every token traces to a literal value the site itself ships.

It refuses the category-default "AI dashboard" look this app used to be: near-black surfaces, a neon/violet accent, glowing edges, a swappable multi-theme picker. Warmth is disciplined, not decorative — gold appears on primary actions, active nav state, focus rings, and key numerics, never drenched across a screen. Dark mode exists as a secondary, opt-in re-tint of the same plaster/gold family (the marketing site itself never shipped one), so switching modes never breaks brand identity.

**Key Characteristics:**
- Warm plaster neutrals carry every surface; gold is the single, restrained accent, not a wash.
- Display serif (Cormorant Garamond) for titles and empty states; Cormorant SC small caps for section labels; Inter for all body, form, and table text.
- Shadows are brown/ink-tinted, never neutral gray.
- Exactly one accent theme (gold) — no multi-theme picker exists in the shipped build.
- The logo is a supplied brand asset, cropped by fixed math, never redrawn or reinterpreted.

## Colors

The palette is a warm, low-saturation plaster ground with a single gold accent reserved for action and emphasis — never a competing secondary or tertiary hue.

### Primary
- **Gold Leaf** (`#8A6A2C`, gold-700): primary button fill, `text-primary` links, active nav text, focus outlines' resting color. Deliberately one step deeper than the marketing site's literal `--accent` (gold-600) so text and white-on-primary both clear 4.5:1 against the plaster surfaces in the denser app context.
- **Gold Leaf, Hover** (`#A5813F`, gold-600): hover/lighter state for primary fills, `--ring`, `--chart-1`, and other non-text accents that only need 3:1 — this is the site's own literal `--accent` value, repositioned to a decorative/hover role rather than text duty.

### Neutral
- **Plaster Ground** (`#FBF8F3`, plaster-50): app background (light mode) — the site's own `--bg`.
- **Raised White** (`#FFFFFF`): card/popover surfaces sitting above the plaster ground — the site's `--bg-raised`.
- **Plaster Ink** (`#1A1612`, plaster-900): primary text (light mode) — the site's `--fg`.
- **Muted Plaster** (`#635947`, plaster-600): secondary/muted text — the site's `--fg-muted`.
- **Plaster Line** (`#ECE3D2`, plaster-200): default borders/dividers/muted fills — the site's `--border`.
- **Plaster Line, Strong** (`#D9CCB3`, plaster-300): input borders and emphasized dividers — the site's `--border-strong`.
- **Dark-mode re-tint**: plaster-900 ground, plaster-100 ink, plaster-800 cards, gold-400 accent — this system's own inversion of the same family (never pure black, never pure white), since the marketing site has no dark mode to draw from directly.

### Named Rules
**The Deepened-Accent Rule.** Gold-700, not the site's literal gold-600 `--accent`, carries text and button-fill duty. Gold-600 is demoted to hover/ring/chart-line duty. This is a deliberate accessibility trade over the literal site token, made once, and should not be "corrected" back to gold-600 for text.

**The Restraint Rule.** Gold covers primary actions, the active nav pill, focus rings, and key numerics — not backgrounds, not body copy, not decorative fills. If a screen reads gold-heavy, it has drifted from the source.

## Typography

**Display Font:** Cormorant Garamond (with EB Garamond, Georgia, serif fallback)
**Body Font:** Inter (with -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif fallback)
**Label/Caps Font:** Cormorant SC (with Cormorant Garamond, serif fallback)

**Character:** A serif with editorial warmth for identity moments, paired with a plain, fast-scanning sans for the actual work — the same pairing bricknpapers.com ships, carried into a denser context.

### Hierarchy
- **Display** (Cormorant Garamond, 500, `text-xl`+): card/module titles, empty-state moments, auth page headlines (e.g. "Welcome back"). Feeds shadcn's `font-heading` mapping, so card/dialog/sheet/popover/alert titles pick it up automatically without a per-component override.
- **Caps/Label** (Cormorant SC, 600, tracked wide): sidebar section title ("Brick N Papers" wordmark next to the mark) and small-caps identity labels.
- **Body** (Inter, 400, `text-sm`/`text-base`): all form fields, table/list content, buttons, nav labels, descriptions.

### Named Rules
**The One-Serif Rule.** Display serif is reserved for titles and identity moments only. Every interactive/dense surface — forms, tables, lists, buttons — stays in Inter. The pairing exists so brand doesn't slow down daily task work.

## Layout

The app shell is a fixed-width sidebar (`w-60` desktop, `w-64` mobile drawer) beside a fluid primary content column. Density favors Operate-mode scanability over marketing-page air: compact row heights (`h-8`/`h-9` controls), tight nav item padding (`px-3 py-2.5`/`py-2`), and cards with `1rem` internal padding. Auth pages center a single `max-w-md` card on the plaster ground, unconstrained by the app shell. Mobile collapses the sidebar to a slide-in drawer with a backdrop; desktop keeps it always-visible and static.

## Elevation & Depth

Depth is conveyed through soft, ink-tinted shadows plus flat card surfaces above the plaster ground — never neutral-gray shadows. In light mode every shadow is tinted `rgba(43, 38, 32, …)` (plaster-800), lifted directly from the site's own `--shadow-md`/`--shadow-frame`; dark mode swaps to a plain black tint at higher opacity for the same visual weight on dark surfaces. Cards themselves also carry a 1px `ring-foreground/10` in addition to shadow, so elevation isn't shadow-only.

### Shadow Vocabulary
- **sm** (`0 1px 2px rgba(43,38,32,0.06)`): subtle separation, e.g. thin dividers with intent.
- **md** (`0 8px 24px rgba(43,38,32,0.08), 0 2px 4px rgba(43,38,32,0.04)`): default card/popover lift.
- **lg** (`0 12px 32px rgba(43,38,32,0.14), 0 2px 4px rgba(43,38,32,0.06)`): dialogs/sheets.
- **xl / 2xl**: escalating versions of the same recipe for the highest-elevation surfaces (modals over modals, dropdown menus).

### Named Rules
**The Ink-Tint Rule.** Shadows are never neutral gray. Light mode tints with plaster-800 brown; dark mode tints with black. A gray shadow anywhere in this system is a bug, not a variant.

## Shapes

Corners use the app's own shadcn radius scale (`--radius: 0.625rem`, scaled into `sm`/`md`/`lg`/`xl`/`2xl` steps) — not the marketing site's own corner values. A dense data app needs tighter, more consistent geometry than a hero marketing page, so this is a deliberate, confirmed divergence from the literal site tokens. Cards round at `rounded-xl`, buttons/inputs at `rounded-lg`, badges are fully pill-shaped (`rounded-4xl`). Borders are hairline (`1px`) and use the plaster border scale, never the accent color, except on focus.

## Components

### Buttons
- **Shape:** `rounded-lg` (≈0.5rem), default height `h-8` (compact) up to `h-9` (auth/primary CTA).
- **Primary:** `bg-primary` (gold-700) fill, `text-primary-foreground` (plaster-50), hover to `bg-primary/80` or `bg-primary/90` on emphasis CTAs (login/signup submit).
- **Hover / Focus:** hover softens opacity rather than shifting hue; focus shows a `ring-3 ring-ring/50` (gold-600 ring) plus a subtle 1px translate-down on active press.
- **Outline / Secondary / Ghost:** outline uses a plain border and `hover:bg-muted`; secondary uses the plaster-100 fill; ghost is borderless until hover; destructive uses a tinted red fill (`bg-destructive/10`), never a solid red block.

### Cards / Containers
- **Corner Style:** `rounded-xl`.
- **Background:** `bg-card` (white in light mode, plaster-800 in dark mode) above the plaster ground — never the same tone as the page background.
- **Shadow Strategy:** ink-tinted shadow (see Elevation) plus a 1px `ring-foreground/10` outline.
- **Internal Padding:** `py-4`/`px-4` default, `py-3`/`px-3` on the compact `size="sm"` variant.

### Inputs / Fields
- **Style:** `rounded-lg`, `border border-input` (plaster-300), `bg-transparent` — inputs show the card/page surface through them rather than sitting on an opaque fill. This is the current, correct pattern; a prior auth-page override that forced a redundant `border-border bg-muted` (lower-contrast) was removed during finish review and should not be reintroduced.
- **Focus:** border shifts to `border-ring`/`border-primary` with a `ring-3 ring-ring/50` (or `ring-primary/20` on auth forms) glow — no layout shift.
- **Error:** `aria-invalid` swaps the border/ring to destructive tones; the login page's top-level error banner uses a tinted `bg-destructive/10 border-destructive/20` block, not a solid red alert.

### Navigation
- Sidebar nav rows: `text-sm font-medium`, `rounded-lg`, `px-3 py-2.5` (mobile) / `py-2` (desktop). Default state is `text-muted-foreground`; hover adds `bg-muted`; active state is a **soft-tint pill** — `bg-primary/10 text-primary` — never a solid gold fill on the row. Unread/notification indicators are small gold dots or pill badges (`bg-primary`, `text-primary-foreground`), reserved for real unread counts.
- Section labels (e.g. the sidebar wordmark) use the Cormorant SC caps face at small size with wide tracking.

### Brand Mark (signature component)
The logo (`public/brand/logo.png`) is supplied brand IP, not a redrawable asset: it's cropped to just the scroll-on-brick glyph (background-size `122% 117%`, position `0% 0%`, isolating roughly the source's top-left 680×650 of its 831×758 canvas) to drop the wordmark/TM mark that doesn't survive at chrome sizes. It always tiles on `bg-card` (white in light mode, dark plaster in dark mode) — never on the gold accent — because the glyph's own line art is a gold gradient and a gold tile behind it collapses the artwork into its own negative space. `BrandMark` (sidebar, auth pages) and `app/icon.tsx` (favicon) share this exact crop/tile recipe.

## Do's and Don'ts

### Do:
- **Do** use gold-700 (`#8A6A2C`) for any text or button-fill accent use, and reserve gold-600 (`#A5813F`) for hover/ring/decorative duty — this order is a confirmed accessibility fix, not the literal site value.
- **Do** tint every shadow with plaster-800 brown in light mode (`rgba(43,38,32,…)`) and black in dark mode — never neutral gray.
- **Do** tile the brand mark on `bg-card`, never on `bg-primary`/gold.
- **Do** use the app's own shadcn radius scale (`--radius: 0.625rem`-derived) for all app-shell surfaces, not the marketing site's corner values.
- **Do** let `Input` rely on its own `border-input bg-transparent` styling; don't re-override it per screen.

### Don't:
- **Don't** reintroduce a multi-theme accent picker. Exactly one accent (gold) exists in the shipped build; document theming as mode-only (light/dark) if at all.
- **Don't** override `Input`'s base border/background per page (the removed `border-border bg-muted` auth pattern was a legibility regression, not an alternate valid style).
- **Don't** fill nav active-state rows solid gold; the confirmed pattern is the `bg-primary/10 text-primary` soft-tint pill.
- **Don't** redraw, recolor, or reinterpret the logo file — treat `public/brand/logo.png` and its fixed crop math as the only source of truth for the mark.
