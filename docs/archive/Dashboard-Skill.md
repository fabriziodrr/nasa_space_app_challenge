---
name: medical-dashboard-style
description: Create medical dashboards using a gray soft-clay neumorphic visual language with restrained blue accents.
---

# Medical dashboard style

Use this skill when creating or restyling a medical dashboard that should match the visual language of `007-neumorphic-synth.html`.

## Visual direction

Build a calm, precise, soft-clay neumorphic interface. The dashboard should look as if its panels and controls were molded from one medium gray surface. Use depth through paired gray highlights and shadows, with rounded corners and a restrained deep blue accent. The blue should guide attention without overwhelming the neutral surface.

The visual hierarchy is:

1. Page context and primary action.
2. Key medical-workflow metrics.
3. Trends and operational lists.
4. Secondary activity and quick actions.

## Tokens

Use these tokens unless the host product has an established equivalent:

```css
:root {
  --clay: #bfc3c8;
  --clay-light: #c9cdd1;
  --clay-dark: #b2b7bd;
  --hi: #e2e4e6;
  --lo: #92989f;
  --blue: #3b1abd;
  --blue-soft: #d8d2f2;
  --blue-glow: rgba(59, 26, 189, .28);
  --slate: #626970;
  --ink: #4b5158;
  --deep: #272c31;
  --success: #a8734d;
  --warning: #b88753;
  --raise: 10px 10px 20px var(--lo), -10px -10px 20px var(--hi);
  --raise-sm: 5px 5px 10px var(--lo), -5px -5px 10px var(--hi);
  --raise-xs: 3px 3px 6px var(--lo), -3px -3px 6px var(--hi);
  --press: inset 6px 6px 12px var(--lo), inset -6px -6px 12px var(--hi);
  --press-sm: inset 4px 4px 8px var(--lo), inset -4px -4px 8px var(--hi);
  --press-xs: inset 2px 2px 4px var(--lo), inset -2px -2px 4px var(--hi);
  --font: "SF Pro Rounded", Nunito, "Varela Round", "Segoe UI", system-ui, sans-serif;
}
```

## Layout

- Use a centered shell with a maximum width near 1440 px and fluid outer padding.
- On desktop, use a 190–224 px sidebar and a flexible main column.
- The main column should contain a topbar, four KPI cards, then a two-column content grid.
- Prioritize appointments, patients, visit status, weekly trends, recent activity, and quick actions.
- Use CSS Grid with `minmax(0, 1fr)` to prevent overflow.
- Below 1120 px, change four KPI columns to two.
- Below 820 px, turn the sidebar into a horizontal navigation and stack the content panels.
- Below 560 px, reduce padding and hide secondary actions while keeping the primary workflow visible.

## Surfaces and interaction

- Use `linear-gradient(145deg, #c9cdd1, #b2b7bd)` for major surfaces.
- Use `5px 5px 10px #92989f, -5px -5px 10px #e2e4e6` for raised surfaces.
- Do not use heavy dark borders. Let the paired shadows provide separation.
- Use 12–15 px radius for controls, 18–24 px for panels, and around 30 px for the outer shell.
- Raised controls use `--raise-xs` or `--raise-sm`.
- Selected, pressed, or input areas use `--press-xs` or `--press-sm`.
- Use deep blue `#3b1abd` for selected navigation, primary actions, chart lines, active indicators, and focus rings.
- Use `#3b1abd` with reduced opacity for progress gradients and soft blue surfaces.
- Keep the blue controlled. Do not use neon blue, multiple competing accent colors, or a strong glow.
- Use grayscale pills and visible status labels for confirmed, pending, and cancelled states.
- Use line icons with rounded strokes. Avoid filled icon sets that make the soft interface look heavy.
- Hover movement should be subtle, at most 2 px. Pressed controls may scale to `.97` or `.98`.

## Typography and spacing

- Use the rounded system font stack from the tokens.
- Use deep ink for headings, ink for body text, and slate for labels and metadata.
- Labels should be uppercase with `font-size: 10–11px`, `font-weight: 800`, and `letter-spacing: .12–.16em`.
- Use a spacing scale of 8, 12, 16, 20, 24, and 32 px.
- Keep panel padding between 18 and 26 px.
- Use large, compact KPI values and short supporting labels.

## Medical product requirements

- Use semantic landmarks: `aside`, `nav`, `main`, `header`, `section`, and appropriate headings.
- Use real buttons for actions and explicit labels for icon-only controls.
- Always provide `:focus-visible` styling using a 2 px `#3b1abd` outline with a 4 px offset.
- Support `prefers-reduced-motion`.
- Do not communicate a medical status by color alone. Include visible text such as “Confermato”, “In attesa”, or “Annullato”.
- Keep text readable against the medium gray background. The visual softness must not reduce clinical clarity.
- Use fictitious or anonymized data in examples and mockups.

## Deliverable checklist

When implementing a dashboard, provide:

- a reusable stylesheet with the tokens above;
- responsive desktop, tablet, and mobile behavior;
- at least one KPI group, a trend visualization, an appointments or patient list, and recent activity;
- active, hover, pressed, focus, empty, loading, and error states where applicable;
- accessible labels and keyboard navigation;
- a small mockup or route that makes the visual result easy to review.

The companion stylesheet is `medical-dashboard-gray.css`, and the reference mockup is `medical-dashboard-gray-mockup.html`.
