# Accessibility acceptance checklist

Test web with keyboard-only navigation, 200% and 400% zoom/reflow, reduced
motion, Windows high contrast, and at least NVDA/Chrome. Test supported mobile
devices with TalkBack or VoiceOver, large text, orientation changes, and
switch/accessibility controls where available.

- Every action has an accessible name, role, state, and at least a 44px target.
- Focus order follows the visual/task order; focus is visible and not trapped.
- Errors identify the field, explain recovery, and are announced.
- Color never carries meaning alone; flag text and status are present.
- Text/background and non-text contrast meet the adopted WCAG 2.2 level.
- Content reflows without loss or two-dimensional scrolling at target zoom.
- Dynamic sync/notification states use polite live announcements.
- Charts have equivalent text values and do not require pointer precision.
- Plain-language summary and emergency limitation are understood in moderated
  tests by representative patients/caregivers.
- Hindi/Marathi and other approved-language content receives the same testing,
  including screen-reader pronunciation and truncation.

Record environment, assistive technology/version, tester, task, expected and
actual result, severity, evidence, owner, retest, and acceptance decision.
