---
name: Berkeley Omnium Volunteer Hub
description: A plain club tool for finding and claiming a Berkeley Omnium shift.
colors:
  shift-blue: "#4d9fff"
  shift-blue-hover: "#2d7dd2"
  link-hover: "#8ac1ff"
  action-blue: "#007bff"
  action-blue-press: "#0056b3"
  action-blue-deep: "#00458e"
  success: "#48bb78"
  warning: "#f6ad55"
  danger: "#fc8181"
  info: "#4fd1c5"
  text: "#e2e8f0"
  text-secondary: "#a0aec0"
  text-muted: "#cbd5e0"
  page: "#0e1014"
  surface: "#1b1e24"
  surface-sunken: "#14171c"
  surface-raised: "#252a32"
  border: "#383f4a"
  input-border: "#626e7e"
  success-surface: "#13291f"
  success-text: "#96e7b5"
  success-border: "#2c6549"
  warning-surface: "#302414"
  warning-text: "#ffda94"
  warning-border: "#735729"
  danger-surface: "#331c22"
  danger-text: "#ffb1b9"
  danger-border: "#7b3a46"
  info-surface: "#172940"
  info-text: "#b4d7ff"
  info-border: "#385a81"
  light-shift-blue: "#007bff"
  light-shift-blue-hover: "#0056b3"
  light-text: "#1a1a1a"
  light-text-secondary: "#6c757d"
  light-text-muted: "#495057"
  light-page: "#f5f7fa"
  light-surface: "#ffffff"
  light-surface-sunken: "#f8f9fa"
  light-surface-raised: "#e9ecef"
  light-border: "#dee2e6"
  light-input-border: "#ced4da"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "12px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.5rem"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-press}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.5rem"
  button-primary-active:
    backgroundColor: "{colors.action-blue-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.shift-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "1rem 2rem"
  button-disabled:
    backgroundColor: "{colors.light-text-secondary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.5rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.75rem"
  card-shift:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  nav:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    padding: "0.625rem 0"
---

# Design System: Berkeley Omnium Volunteer Hub

## Overview

**Creative North Star: "The Shift Board"**

This is a plain club tool. Dark is the default. Type is the system font. Shift Blue marks a link or an action, and status colors say whether something succeeded, needs attention, or failed. The page should read like a board of shifts, not a campaign.

Density sits between a form and a roster. The homepage has room for the headline and the shift cards. Admin and signup screens are closer together. Nothing here is a marketing site, and nothing here should grow a second visual language beside the board.

The kids' clinic page keeps its own cream, blue, and orange. That palette stays on that page.

**Key Characteristics:**

- Dark by default, with a light theme remembered in the browser.
- One job color: Shift Blue for links and primary actions.
- System type at a readable body size. Headings are the same family, heavier, tighter.
- Surfaces are flat at rest. A border and a background step do the separating.
- A shadow appears when someone points at a shift card or button, or when a menu overlays the page.

## Colors

The default theme is dark. Frontmatter colors without a `light-` prefix are that theme. The `light-` colors are the same roles after the visitor switches theme. Status colors come in a mark, a quiet surface, and a border, and they are for state, not for decoration.

### Primary

- **Shift Blue** (`shift-blue`): Links, the focus ring, and the theme-aware action color. In the default theme it is the brighter blue. The pressed partner is `shift-blue-hover`. Link hover in the dark theme is `link-hover`.
- **Action Blue** (`action-blue`): The blue several existing primary buttons paint directly, including its press (`action-blue-press`) and deeper press (`action-blue-deep`). It matches light-theme Shift Blue. New screens should use the theme variable instead of copying this fixed paint.

### Neutral

- **Night Page** (`page`): The page behind everything.
- **Panel** (`surface`): Cards, fields, and the secondary button fill.
- **Sunken Bar** (`surface-sunken`): The navigation bar and the footer.
- **Raised Step** (`surface-raised`): The current nav item and the open mobile control.
- **Mist Text** (`text`): Primary text.
- **Secondary Text** (`text-secondary`): Footer and supporting text.
- **Muted Text** (`text-muted`): Taglines, empty states, and the scrollbar thumb on hover.
- **Hairline** (`border`): Card, bar, and menu edges.
- **Field Edge** (`input-border`): Input and select borders before focus.

Light theme uses the `light-` tokens for the same roles: a pale page, a white panel, near-black text, and the classic Shift Blue.

### Named Rules

**The One Blue Rule.** Shift Blue is the only action color on the hub. Success, warning, danger, and info are status. They do not become buttons.

**The Theme Token Rule.** New color uses the theme variables. Do not paste Action Blue into a new screen.

## Typography

**Display Font:** the system UI stack (with Arial, then sans-serif)
**Body Font:** the same stack
**Label/Mono Font:** none. Labels use the same stack, heavier.

**Character:** One family, no display face. Size and weight make the hierarchy. Body copy is loose enough to read a waiver. Headings are tight.

### Hierarchy

- **Display** (semibold, the display size, tight leading): The homepage headline only.
- **Headline** (semibold, the headline size, tight leading): Section titles, such as the shift list.
- **Title** (heavier than semibold, the title size, tight leading): The wordmark beside the club logo.
- **Body** (regular, the body size, loose leading): Paragraphs, fields, and form buttons.
- **Label** (semibold, the label size): Navigation items and field labels.

### Named Rules

**The One Family Rule.** Do not add a second typeface for emphasis. Weight and size are the emphasis.

## Layout

The app is a single column of content inside a bar. The shared column stops at 1200px and pads 1rem on the sides. The homepage column stops earlier, at 1000px. The homepage hero is centered. Shift cards wrap in a grid whose columns are at least 260px.

Spacing steps are extra-small, small, medium, large, and extra-large. Reach for those steps before inventing a new gap.

At 1100px and below, the bar collapses to a logo, a 44px menu button, and an overlay menu. The overlay is at most 23rem wide.

## Elevation & Depth

Surfaces are flat at rest. Depth is a background step plus a 1px hairline. A shadow is a response: the medium shadow on a hovered shift card or homepage button, the large shadow on the open mobile menu and a few overlays, the small shadow on a minor raised control. Theme color changes fade over 0.3s. Hover color and lift use 0.2s.

### Shadow Vocabulary

- **Rest:** none. Use a hairline and a surface step.
- **Point:** the medium shadow. Hover on a shift card or a homepage button, and only when the pointer can hover.
- **Overlay:** the large shadow. The mobile menu.
- **Whisper:** the small shadow. A minor raised control, not a card at rest.

### Named Rules

**The Flat Until You Point Rule.** A card at rest has no shadow. If a shadow is doing the job of a border, use the border.

## Shapes

Corners are small and consistent. Fields, nav items, and form buttons use the medium radius. Shift cards use the large radius. The small radius is for minor chrome. The homepage call-to-action uses 8px, which is not on this scale. Do not spread that exception.

Borders are 1px hairlines. The secondary button is the exception: a 2px Shift Blue stroke. The focus ring is a 2px Shift Blue outline, 2px outside the control.

## Components

Plain and pressable. A control looks like a control: solid primary, outlined secondary, a field with an edge, a card that is a link.

### Buttons

- **Shape:** Medium radius on forms. The homepage pair uses 8px.
- **Primary:** Action Blue fill, white text, semibold. Forms use 0.75rem 1.5rem. A full-width form button uses 1rem vertical padding. Disabled turns the fill to the light secondary text color and drops the pointer.
- **Hover / Focus:** Hover darkens the fill to Action Blue Press. The homepage primary goes to Action Blue Deep on press. Focus is the 2px Shift Blue ring. Homepage hover may add the medium shadow, and only for a fine pointer.
- **Secondary:** Panel fill, Shift Blue text, 2px Shift Blue stroke, homepage padding.

### Cards / Containers

- **Corner Style:** Large radius.
- **Background:** Panel, on the night page.
- **Shadow Strategy:** None at rest. Medium shadow on hover for a fine pointer.
- **Border:** 1px hairline.
- **Internal Padding:** 1.25rem. The grid gap is one spacing step.

### Inputs / Fields

- **Style:** Full width, 1px field edge, medium radius, body type, 0.75rem padding. Labels sit above the field, semibold, with a small gap.
- **Focus:** The outline is removed. The edge becomes Shift Blue, with a soft 3px Action Blue ring.
- **Error / Disabled:** Errors use the danger surface, text, and border. Disabled fields use the sunken surface and show no pointer.

### Navigation

The bar is the sunken surface with a hairline under it. The brand is the club logo plus the title "Omnium Volunteer Hub". In the dark theme the logo is inverted to white. Links are label-sized, primary text, medium radius. Hover and the current page use the raised step, not Shift Blue text. Focus uses the same 2px ring as buttons. Below 1100px the links move into an overlay with the large shadow. The menu button is 44px square.

### Status

Success, warning, danger, and info each have a mark, a surface, and a border. Use the set together for a message. A note can also be a sunken-to-info surface with a 4px Shift Blue stripe on its left edge.

## Do's and Don'ts

### Do:

- **Do** keep dark as the default and honor a stored light preference.
- **Do** use the theme variables for new color, type, space, and radius.
- **Do** leave cards flat, and add a shadow only for hover or an overlay.
- **Do** keep one Shift Blue for links, focus, and the primary action.
- **Do** put the focus ring on anything that can be reached from the keyboard.

### Don't:

- **Don't** add a second typeface, a gradient, or a marketing hero treatment.
- **Don't** hardcode Action Blue, Action Blue Press, or Action Blue Deep in new UI.
- **Don't** use status colors as button fills.
- **Don't** let the kids' clinic cream, orange, or clinic blue into the hub.
- **Don't** invent an 8px radius. Use the small, medium, or large step.
