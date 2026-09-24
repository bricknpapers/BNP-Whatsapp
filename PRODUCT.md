# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Brick N Papers' own internal team — support/sales agents, admins, and the
business owner — who use this CRM daily to run the company's WhatsApp
Business line: answering customer inbound messages, tracking leads through
a sales pipeline, sending broadcast campaigns, and automating routine
replies. Not external customers; customers only ever see WhatsApp messages,
never the CRM UI itself.

## Product Purpose

A self-hosted CRM (forked from the open-source "wacrm" template) built
around the official WhatsApp Business API. It exists so Brick N Papers can
run all customer conversations, lead tracking, and campaign sends through
one shared inbox instead of a personal WhatsApp app, with the team,
history, and automations that a personal app can't provide. Success means
the team can see and respond to every conversation, never lose a lead, and
send campaigns without juggling spreadsheets.

## Positioning

Full ownership, self-hosted alternative to WhatsApp CRM SaaS tools:
Brick N Papers owns the code, the Supabase project, and the domain
(`whatsapp.bricknpapers.com`) outright — no seat pricing, no vendor lock-in
— while still getting shared-inbox, pipeline, broadcast, and automation
features comparable to paid SaaS competitors.

## Operating Context

- Deployed at `whatsapp.bricknpapers.com` (Vercel), backed by Supabase
  (Postgres + Auth + Storage) and the Meta WhatsApp Cloud API.
- Modules in use: shared inbox, contacts (with tags/custom fields/CSV
  import), sales pipelines (Kanban), broadcasts (Meta-approved templates),
  no-code automations/flows, AI reply assistant, agents, notifications,
  and account/team settings.
- Roles: owner / admin / agent / viewer, invite-by-link team model.
- Entry points: `/login`, `/signup`, `/forgot-password`, a `/join/[token]`
  invite flow, and the authenticated `(dashboard)` app shell.
- Ships in English, Korean, Brazilian Portuguese, and Spanish
  (`messages/`); any UI copy changes must stay translatable.

## Capabilities and Constraints

- Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4,
  shadcn-based components, Supabase.
- Current UI runs a generic dark-mode/violet shadcn theme with
  swappable accent themes — this is template scaffolding, not a
  confirmed brand decision, and is the incumbent look this redesign
  replaces.
- Real product/company data only; no invented customers, testimonials,
  or metrics.

## Brand Commitments

- This deployment is exclusively and permanently Brick N Papers-branded
  (not a white-label/template instance) — the company name, logo, and
  identity are hard-coded throughout (sidebar, auth pages, emails,
  favicon, etc.), not left as configurable/swappable branding.
- Company: Brick N Papers — an Indian design studio (Gandhinagar,
  est. 2018) making hand-blocked wallpapers, wall art, and décor,
  made-to-order, for design-conscious homeowners, architects, and
  designers. Marketing site: bricknpapers.com. Tagline: "Walls, but
  make them poetry." Positioning: "affordable luxury with trend-forward
  design."
- Official logo provided by the user: `public/brand/logo.png` — a gold
  gradient scroll-of-wallpaper unrolling over a brick course, with a
  "BRICK N PAPERS" wordmark and a TM mark. Use this file as the source
  of truth for the mark; do not redraw or reinterpret it.
- The CRM's visual world must derive from bricknpapers.com's actual
  shipped design tokens (extracted from its production CSS, not a
  paraphrase):
  - `--font-display`: "Cormorant Garamond", "EB Garamond", Georgia, serif
  - `--font-caps`: "Cormorant SC", "Cormorant Garamond", serif
  - `--font-body`: "Inter", -apple-system, BlinkMacSystemFont,
    "Helvetica Neue", sans-serif
  - `gold` scale 50→900: #FBF6E8, #F4E9C8, #E8D697, #DCC371, #C9A94E,
    #B5912F, #A5813F, #8A6A2C, #6B511F, #4A3814
  - `gold-gradient`: linear-gradient(135deg,#E5C853,#C9A94E 35%,#A5813F)
  - `plaster` scale 50→900 (warm neutrals): #FBF8F3, #F5EFE4, #ECE3D2,
    #D9CCB3, #B5A78A, #8A7C63, #635947, #463F33, #2B2620, #1A1612
  - site's semantic mapping: bg=plaster-50, bg-raised=#FFFFFF,
    fg=plaster-900, fg-muted=plaster-600, border=plaster-200,
    border-strong=plaster-300, accent=gold-600
  - soft warm-toned shadows (`shadow-md`, `shadow-frame` — brown-tinted,
    not neutral gray) and an `ease-out` cubic-bezier(0.22,1,0.36,1)

## Evidence on Hand

- Official logo file: `public/brand/logo.png` (provided directly by the
  user; verified as matching the pasted reference image).
- Marketing site with a live, inspectable production stylesheet:
  https://bricknpapers.com/ — used as the literal token source above,
  not a stylistic impression.
- README.md documents the full current feature set and stack; treated
  as authoritative for scope and terminology.
- No customer testimonials, usage metrics, or case studies on hand for
  the CRM itself — none should be fabricated.

## Product Principles

- One brand, fully committed: nothing in the CRM should read as a
  generic template anymore — every surface carries Brick N Papers'
  actual identity, not a placeholder.
- Operate mode throughout: this is a daily-use work tool (inbox,
  pipeline, broadcasts), so scanability, density, and task speed win
  over marketing-site expression; brand shows up in disciplined
  details (color, type, shadow, motion) rather than decorative flourish.
- Warmth without losing legibility: the site's gold/plaster/serif world
  is inherently warmer and lower-contrast than a typical SaaS dark
  theme — hierarchy and contrast ratios must be re-proven in the dense
  app context (tables, kanban cards, inbox lists), not assumed to carry
  over from a marketing page.
- Token fidelity: reuse the site's actual token values (colors, fonts,
  shadow tint, easing) as the system's foundation rather than
  approximating a "similar" palette from memory.
- Whole-app consistency: every module (inbox, contacts, pipelines,
  broadcasts, automations, agents, notifications, settings, auth) must
  read as one system, not a reskinned shell around unchanged pages.

## Accessibility & Inclusion

No product-specific accessibility requirement was established beyond
standard web accessibility; the existing shadcn/Radix component
foundation should be preserved for its built-in keyboard/ARIA behavior
as the visual layer is replaced.
