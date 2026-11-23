---
name: BM Bus Tracker
colors:
  surface: '#f9f9ff'
  surface-dim: '#cddbf5'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d6e3fe'
  on-surface: '#0e1c2f'
  on-surface-variant: '#434656'
  inverse-surface: '#243145'
  inverse-on-surface: '#ebf1ff'
  outline: '#737687'
  outline-variant: '#c3c5d9'
  surface-tint: '#004fe5'
  primary: '#0048d4'
  on-primary: '#ffffff'
  primary-container: '#1e60ff'
  on-primary-container: '#f2f2ff'
  inverse-primary: '#b6c4ff'
  secondary: '#006b5b'
  on-secondary: '#ffffff'
  secondary-container: '#53f8d9'
  on-secondary-container: '#00705f'
  tertiary: '#b0071c'
  on-tertiary: '#ffffff'
  tertiary-container: '#d42b31'
  on-tertiary-container: '#fff1ef'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164f'
  on-primary-fixed-variant: '#003bb0'
  secondary-fixed: '#57fbdb'
  secondary-fixed-dim: '#2adec0'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005144'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ae'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930014'
  background: '#f9f9ff'
  on-background: '#0e1c2f'
  surface-variant: '#d6e3fe'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 22px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  margin: 1rem
  margin-lg: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers a high-performance, real-time urban mobility experience engineered specifically for Udaipur's city transit network. Moving away from clunky, ad-cluttered government utility apps, the aesthetic balances modern consumer tech agility with razor-sharp transit precision. 

The visual style is **Contemporary Mobility Neo-Utility**:
- **Tactile & Fluid:** High-response touch surfaces with pill chips, elevated floating bottom sheets, and live telemetry indicators.
- **Independent Tech Agency Polish:** High-contrast crisp neutrals, vivid electric accents, deep navy typography, and refined micro-borders, establishing the app as an independent digital product rather than an institutional state service.
- **Clarity Under Sunlight:** Ultra-legible typographic weights and contrast ratios exceeding WCAG AAA standards for high outdoor readability under intense Rajasthan sunlight.

## Colors

The color palette anchors on dynamic transit feedback: Electric Blue signals core actions and primary navigation paths, while Vivid Teal acts as the live telemetry pulse (tracking live buses, on-time arrivals, and active progress). 

### Palette Allocation
- **Primary (`#1E60FF`):** Main branding, journey search buttons, selected route paths, interactive primary nodes.
- **Secondary / Accent (`#00D2B4`):** Live telemetry indicators, active GPS tracking pulses, punctual status tags, bus occupancy meters.
- **Tertiary / Warning (`#FF4B4B`):** Delays, crowded status, route disruptions, cancelled trips.
- **Deep Slate Navy (`#0B192C`):** Base canvas typography, active tab icons, dark mode surface layers.
- **Surface & Backgrounds:** Crisp off-white (`#F8FAFC`) canvas paired with pure white (`#FFFFFF`) card containers to ensure crisp layering.
- **Border Dividers (`#E2E8F0`):** Subtle structural boundaries framing route itineraries and stops.

## Typography

The typography couples the modern geometry of **Plus Jakarta Sans** for headlines, titles, and body content with the utilitarian precision of **Inter** for data tables, arrival timers, countdown badges, and platform labels. 

- Numeric values (ETA counters, platform numbers, bus route numbers) must always use tabular figures (`font-variant-numeric: tabular-nums`) to prevent shifting layouts during live countdowns.
- `label-sm` is reserved for uppercase status badges such as `LIVE GPS`, `DELAYED`, and `EXPEDITE`.

## Layout & Spacing

The layout is built for single-handed mobile navigation with an adaptive fluid model. The interface centers around a layered viewport structure:
1. **Interactive Base Layer:** Full-screen vector map view showing bus telemetry, stops, and polyline routes.
2. **Bottom Sheet & Overlay Layer:** Expandable bottom cards structured on an 8pt grid system.

### Responsive Breakpoints
- **Mobile (<640px):** Single-column layout. 16px (`1rem`) outer margins. Search input and key trip cards anchor to the bottom 40% of the screen for thumb reach.
- **Tablet / Large Mobile (640px - 1024px):** Split-view layout with a fixed 380px transit panel on the left and full-bleed live maps on the right.

## Elevation & Depth

Visual hierarchy uses crisp surface layering and ambient directional lighting rather than muddy drop shadows.

- **Level 0 (Map / Ground Canvas):** Base map canvas and `#F8FAFC` screen background.
- **Level 1 (Inline Route Cards & Stop Tiles):** Pure white `#FFFFFF` with a `1px solid #E2E8F0` border and a faint ambient shadow (`0 2px 8px -2px rgba(11, 25, 44, 0.04)`).
- **Level 2 (Floating Action Buttons & Search Bars):** Pure white `#FFFFFF` surface with `1px solid #E2E8F0` and an elevated shadow (`0 8px 24px -4px rgba(11, 25, 44, 0.08)`).
- **Level 3 (Modal Sheets & Live Telemetry Modals):** White background with a subtle blue tint wash, framed by a soft upper shadow (`0 -10px 30px -5px rgba(11, 25, 44, 0.12)`).

## Shapes

The design system employs friendly, modern rounding across components to deliver an ergonomic touch experience. Base cards and bottom sheets use a generous radius (`rounded-2xl` / 16px to 24px) to soften the UI, while actionable chips, badges, and quick-filter buttons adopt full pill shapes (`rounded-full`).

## Components

### Buttons
- **Primary Action (Journey Search, Track Bus):** Height of 48px, background `#1E60FF`, text `#FFFFFF`, font `Plus Jakarta Sans` semi-bold 15px, border-radius 12px. Active press scales down slightly (`scale(0.98)`).
- **Secondary / Quick Swaps:** Outline style with `#E2E8F0` border, `#0B192C` text, and white background.

### Live Telemetry Chips & Status Badges
- **Live GPS Badge:** Pill shape, background `rgba(0, 210, 180, 0.12)`, text `#008B77`, containing a pulsing 6px `#00D2B4` dot and `Inter` bold 11px uppercase label.
- **On-Time Arrival Tag:** Background `#F0FDF4`, border `1px solid #DCFCE7`, text `#15803D`.
- **Delayed Tag:** Background `#FEF2F2`, border `1px solid #FEE2E2`, text `#B91C1C`.

### Route & Platform Chips
- **Bus Route Code (e.g., "Line 4A - Chetak Circle"):** Compact pill badge with Electric Blue accent background `#1E60FF`, text `#FFFFFF`, bold `Inter` 12px.
- **Stop Chips:** Pill shape with `#F1F5F9` background, `#0B192C` text, and 8px horizontal padding.

### Cards & Route Timeline
- **Bus Journey Card:** Pure white container with 16px corner radius, micro-border `#E2E8F0`, containing route origin/destination nodes linked via an Electric Blue vertical route tracker.
- **Stop Node Indicator:** Hollow 8px circle for upcoming stops; filled Vivid Teal circle with pulse ring for current live bus location.

### Input Fields
- **Source & Destination Search:** 52px height, filled with `#FFFFFF`, border `1px solid #E2E8F0`, icon-prefixed (Green dot for origin, Red pin for destination), placeholder in `#64748B`. Focus state transitions to a 2px `#1E60FF` halo.