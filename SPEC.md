# yiphang-portfolio specification

## Conventions
- Sections with ids: #hero #about #skills #projects #repos #contact. All six must exist.
- Responsive: no horizontal scroll at a viewport width of 375px.
- #repos lists public GitHub repos as cards, or shows a plain message if there are none or the fetch fails.
- #hero, #contact contain links to email, GitHub and LinkedIn.

## Issue #1: dark-mode toggle
- A button in the nav toggles a 'dark' class on <body>.
- The choice is kept for the session.

## Issue #4: visual feedback on interaction
- Cards in #projects and #repos visibly change on hover and on keyboard focus within the card (for example a lift, border colour or shadow).
- Buttons (hero links, the dark-mode toggle) and nav links have distinct hover, focus-visible and pressed states.
- Changes are animated with short transitions (200ms or less), and the animations are turned off when the visitor has prefers-reduced-motion: reduce set.
- The effects work in both light and dark mode.
