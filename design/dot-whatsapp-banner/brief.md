# Banner Design Brief: dot-whatsapp

## Goal
Create a banner image (1200×200) for the dot-whatsapp repository README that follows the Gentle ecosystem design language.

## Brand Identity
- **Product**: dot-whatsapp — WhatsApp bridge for Gentle Dot
- **Tagline**: "Your Gentle Dot assistant, one WhatsApp message away"
- **Parent brand**: Gentle Dot / Gentle-AI ecosystem

## Design Language (Gentle Ecosystem)
- **Background**: `#1A1218` (deep dark)
- **Primary accent**: `#F095C8` (rose/pink) — used for glow, strokes, highlights
- **Secondary accent**: `#D7A0B8` (muted rose) — for muted text
- **Highlight**: `#FF2D7A` (neon rose) — for stroke glow
- **Core light**: `#FFD6E8` — for stroke core
- **Badge amber**: `#F5A524` — for "needs_you" state
- **Text primary**: `#F6EFF3` (off-white)
- **Text muted**: `#A78E9B` (muted rose)
- **Line/border**: `#342230` (dark rose)

## Visual Elements
1. **Central rose glyph** — the iconic gentle rose (from `docs/brand/rose-glyph.svg`), scaled up as the hero element
2. **Glow rings** — concentric circles with `#F095C8` at varying opacities (0.15, 0.3) to create depth
3. **Neon stroke glow** — the rose path with `#FF2D7A` glow effect
4. **Core highlight** — subtle `#FFD6E8` on the rose center
5. **Typography** — system-ui/sans-serif, clean and modern

## Layout (1200×200)
- Centered composition
- Rose centered at (600, 100)
- Title "dot-whatsapp" below rose at y=180
- Subtitle "Your Gentle Dot assistant, one WhatsApp message away" at y=200
- Glow rings behind rose for depth

## Deliverables
1. **banner.svg** — vector source (for scalability)
2. **banner.png** — 1200×200 raster (for README embedding)
3. **rose.svg** — 28px glyph (for inline use in README)

## Constraints
- Must respect Gentle ecosystem trademarks (Gentle AI™, Engram™)
- Follow Gentle ecosystem dark-only theme (no light theme)
- Use only approved color palette
- Rose glyph must match official Gentle rose design
- No WhatsApp green (#25D366) — this is a Gentle ecosystem product
- WhatsApp reference only in text, not visual identity