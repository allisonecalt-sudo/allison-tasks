# Task App — Current State & What We're Working On
*Written Sunday March 29, 2026 — handoff doc for new Claude session*

## What This App Is
Allison's personal task manager. Live at: https://allisonecalt-sudo.github.io/allison-tasks/
Code: c:/tmp/allison-tasks/index.html (single file app)
Supabase project: hpiyvnfhoqnnnotrmwaz (same as budget app)
Login: allisonecalt@gmail.com / Coppoc1234

## The Core Problem — She's Overwhelmed
Allison says the app feels overwhelming. She can't articulate exactly why but it's something about visual hierarchy — too much to look at, unclear what to focus on first. She knows things are improving but it still doesn't feel calm.

Playwright audit confirmed: **10 tabs** (My Day, Focus, All, Streams, Week, Events, Recurring, Done, History, Dashboards). That's a lot. Zero console errors — the app is technically clean.

## What We Need to Build

### 1. Recurring Tasks (PRIORITY)
Two types — needs to be built properly:

**Fixed schedule** — task appears on set dates regardless of when you completed it. Marking done just logs it. Next occurrence stays on schedule.
- Example: שעות נוספות — every other Sunday (April 5, 19, May 3, 17...)

**Rolling schedule** — next occurrence is X days/weeks from when you LAST completed it. Resets on completion.
- Example: Clean dryer condenser filter (Electra EL895) — every 3 weeks from last cleaned

The "Recurring" tab already exists in the app but probably doesn't have this logic yet. Need to check what's there and build it out properly.

### 2. UX Overwhelm — Reduce Visual Noise
The app has too many tabs. Allison feels overwhelmed opening it. Needs:
- Clearer hierarchy — what do I look at FIRST
- Possibly consolidate or hide some tabs
- Better "today" focus — surface what matters now, hide the rest
- This needs conversation with Allison before building — she needs to see options

### 3. Dryer Filter Recurring Task (example to test with)
- Task: "Clean dryer condenser filter (Electra EL895)"
- Type: Rolling, every 3 weeks from last completion
- Already added to Supabase manually (due April 19) — but needs proper recurring logic

### 4. שעות נוספות Recurring Task
- Task: "Submit שעות נוספות to Nili"
- Type: Fixed, every other Sunday
- Already added manually for April 5, 19, May 3, 17 — but should be driven by recurring system

## What's Already in the App (from Playwright audit)
- 10 tabs: My Day(7) · Focus(60) · All(75) · Streams · Week(23) · Events · Recurring · Done(19) · History · Dashboards
- Quick-add bar with + button (works, just needs text first)
- Status filter dropdown
- Zero console errors
- Screenshots in: c:/tmp/allison-tasks/test-results/

## Playwright Setup
- Tests: c:/tmp/allison-tasks/tests/
- Run: `cd c:/tmp/allison-tasks && npx playwright test`
- Credentials saved in ui-audit.spec.js defaults
- Config: playwright.config.js — baseURL is https://allisonecalt-sudo.github.io (note: no trailing path, use /allison-tasks/ in goto() calls)

## Files
- App: c:/tmp/allison-tasks/index.html
- Tests: c:/tmp/allison-tasks/tests/
- Supabase key: ~/.supabase-budget-key
- Tasks table: same Supabase project as budget app

## How Allison Works (important context)
- She thinks out loud — first request is never final. Ask, listen, then build.
- Voice to text often — typos are normal, don't comment on them
- She wants to understand what's being built, not just have it done
- "It feels overwhelming" = real signal, even if she can't explain exactly why
