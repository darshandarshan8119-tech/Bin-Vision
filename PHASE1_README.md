# BIN-Vision — Phase 1: Extension Foundation

> **Goal:** Chrome extension that identifies all interactive elements on any webpage and prints a structured analysis to the browser console.

---

## What Phase 1 Builds

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome MV3 extension manifest |
| `src/shared/types.ts` | All TypeScript types for all phases |
| `src/shared/constants.ts` | Thresholds, patterns, config |
| `src/shared/logger.ts` | Safe logger (never logs PII) |
| `src/background/service_worker.ts` | Background service worker |
| `src/content/index.ts` | Content script (runs on every page) |
| `src/perception/dom_analyzer.ts` | Core DOM extraction module |

---

## Step 1 — Prerequisites

Make sure these are installed:

```powershell
# Check Node.js (need >= 20)
node --version

# Install pnpm globally if not installed
npm install -g pnpm

# Verify pnpm
pnpm --version
```

---

## Step 2 — Install Dependencies

```powershell
# From the extension/ folder:
cd c:\Users\darsh\OneDrive\Desktop\AI-project\BIN-vision\extension

pnpm install
```

> This installs all packages from `package.json`. First run may take 1-2 minutes.

---

## Step 3 — Build the Extension

```powershell
# Development build (with source maps, readable output):
pnpm dev

# OR one-shot build:
pnpm build
```

This produces a `dist/` folder inside `extension/`.

> **Keep `pnpm dev` running** during testing — it auto-rebuilds on every file change.

---

## Step 4 — Load Extension in Chrome

1. Open Chrome and go to: `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Navigate to: `c:\Users\darsh\OneDrive\Desktop\AI-project\BIN-vision\extension\dist`
5. Click **Select Folder**

You should see **BIN-Vision** appear in the extensions list with a purple icon.

---

## Step 5 — Test on the Test Page

1. Open the test form in Chrome:
   - `File → Open File` → navigate to `tests\fixtures\test_form.html`
   - Or drag the file into Chrome

2. Open **DevTools** (`F12`) → go to the **Console** tab

3. You should see output like:

```
[BIN-Vision] Content script loaded on: file:///...test_form.html
[BIN-Vision] Starting DOM analysis...
[BIN-Vision] DOM analysis complete {elements: 22, timeMs: "12.3", page: "BIN-Vision Phase 1 Test..."}
```

4. A **collapsible group** should appear in the console with a table like:

| id  | type     | label             | htmlType | visible | interactable |
|-----|----------|-------------------|----------|---------|--------------|
| e1  | input    | First Name        | text     | true    | true         |
| e2  | input    | Last Name         | text     | true    | true         |
| e3  | input    | Email Address     | email    | true    | true         |
| e4  | input    | Phone Number      | tel      | true    | true         |
| e5  | input    | Username          | text     | true    | true         |
| ... | ...      | ...               | ...      | ...     | ...          |
| e?  | input    | Password          | password | true    | true         |

---

## Phase 1 Exit Criteria (Verification Checklist)

Before moving to Phase 2, verify ALL of these:

- [ ] Extension loads in Chrome without errors
- [ ] Console output appears on `test_form.html`
- [ ] All form inputs are detected (should be ~18-22 elements)
- [ ] Labels are correctly resolved for all fields:
  - [ ] `First Name`, `Last Name`, `Email Address`, `Phone Number` — via `<label for="id">`
  - [ ] `Username` — via `aria-label`
  - [ ] `Date of Birth` — via `aria-labelledby`
  - [ ] `Gender` — via parent `<label>` wrapping
  - [ ] `City`, `State`, `PIN Code` — via placeholder
  - [ ] `Aadhaar Number` — via previous sibling text
  - [ ] `PAN Card Number` — via title attribute
- [ ] Password fields are detected BUT their **value is `undefined`** (never captured)
- [ ] Buttons are detected with correct `innerText`
- [ ] Links are detected (`Login`, `Privacy Policy`, `Terms of Service`)
- [ ] `visible: true` for all visible elements
- [ ] `interactable: true` for all enabled elements
- [ ] Analysis time is under 100ms
- [ ] Test on a real website (e.g., `https://github.com/signup`) — verify it works

---

## Test on Real Websites

After verifying the test form, open a real registration page and check the console:

| Website | URL |
|---------|-----|
| GitHub Signup | https://github.com/signup |
| Google Account | https://accounts.google.com/signup |
| Twitter/X Signup | https://twitter.com/i/flow/signup |

Each should show a DOM analysis table in the console.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Extension not loading | Make sure you selected the `dist/` folder, not `extension/` |
| No console output | Check that `pnpm dev` ran without errors; check DevTools for errors |
| Build fails | Run `pnpm install` first; check Node version >= 20 |
| Icons missing | Run `node generate-icons.js` from the `extension/` folder |
| "Cannot find module" error | Delete `node_modules/` and run `pnpm install` again |

---

## File Structure After Phase 1

```
extension/
├── dist/                    ← Loaded in Chrome (auto-generated)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── service_worker.ts
│   ├── content/
│   │   └── index.ts
│   ├── perception/
│   │   └── dom_analyzer.ts
│   └── shared/
│       ├── types.ts
│       ├── constants.ts
│       └── logger.ts
├── manifest.json
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## What's Next — Phase 2

Phase 2 adds **Semantic Field Classification**:

```
DOM elements
    ↓
semantic_classifier.ts
    ↓
Each element gets: { semantic: "EMAIL" | "NAME" | "PHONE" | ... }
```

When you're satisfied Phase 1 works correctly, say **"build phase 2"**.
