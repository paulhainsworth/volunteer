# Magic link email – lower-risk revision

**File:** `magic-link-email-revised.html`

This revision keeps the same structure and message as the original template but reduces the chance of delivery issues (spam filters, stripping, bounces).

## Changes that reduce risk

| Original | Revision | Why |
|----------|----------|-----|
| `linear-gradient(...)` on header and button | Solid `#1a56b0` | Gradients are often stripped or mishandled; solid hex is reliable. |
| `rgba(255,255,255,0.15)` / `rgba(255,255,255,0.8)` | Solid hex (`#b4d4f0` for subtitle) | Some gateways strip or alter rgba. |
| Emoji in header (🚴) and security (🔒) | Removed | Emoji can affect encoding and spam scoring. |
| `box-shadow` on card | Removed; use `border:1px solid #e5e7eb` | Shadow can be stripped or trigger filters. |
| `border-radius` on card/button | Removed on outer card (optional: keep on button if you test) | Max compatibility; some clients ignore it anyway. |
| Nested table for security row (icon + text) | Single `<td>` with text only | Fewer elements, less to go wrong. |
| Unsubscribe link | Removed | No real URL; reduces “marketing” signal. |
| Font stack with `-apple-system`, `BlinkMacSystemFont` | `Arial, Helvetica, sans-serif` | Safe, universal. |
| Slightly longer copy | Shortened one sentence | Keeps tone, slightly smaller payload. |

## Placeholder

- `REPLACE_ACTION_LINK` in the HTML file is the placeholder for the magic link URL. In the edge function, replace it with the actual link (and escape `&` as `&amp;` in the href).

## Using this in the edge function

1. Paste the HTML into `send-welcome-with-magic-link/index.ts` (e.g. as a template string).
2. Replace `REPLACE_ACTION_LINK` with the escaped `actionLink` (e.g. `actionLink.replace(/&/g, '&amp;')` for the href).
3. Deploy and test delivery; if it’s stable, you can reintroduce one thing at a time (e.g. border-radius on the button) and test again.
