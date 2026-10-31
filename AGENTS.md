# AGENT.md - PageTyper Project Context & Change Tracking

## Verbatim User Change Requests Log (Chronological Inception)

### 1. Inception Request
> "create web extn that I can use in edge/chrome/firefox/safari, called PageTyper, user can practice typing on any page text contents, user can do tab/shift tab to select start of any text content as he types page should auto select/scroll to next content automatically, it should also highlight user typed text, incase typo, it should be show as subtext at the mistaken place top, initial mode is just text, no punctuation or characters or case, so it should auto move/highlight subsequent text smartly"

### 2. Selection-to-Typing Reset
> "when extn is on and I select any text in page, intelligently reset typing block to selected paragraph"

### 3. Lenient Space Typing
> "be linent of space, user can optionally type space as he does in normal typing or not"

### 4. Smart Space Word-Skipping & Content Skipping
> "also make space to skip past words, since this is not only typing practice but also content practice, for e.g. particular command or couple of lines, user should be able to skip all what he feels not needed text. it should be intelligent so space is allowed typeable character as well as work skip, how will you handle it?"

### 5. Fix Tab / Shift+Tab Navigation
> "after this change, tab/shift+tab not working properly"

### 6. Accuracy Tooltip with Worst Error Breakdown
> "in accuracy show tooltip on mousehover, so error rates for letters from worst"

### 7. Space First-Character Context Disambiguation
> "don't skip words with space when on first character, when previous character is not space, as well as when it is not first character in paragraph"
>
> *(Clarified further in next prompt)*
> "I meant when it is first character then user types space he meant skipping, when he is actively typing since our smart auto skip moves to first character of next work, and now he types space he meant auto skipped space. also when previous is space and now we are in first character of next work, another space is meant for skipping only"

### 8. Firefox MV3 Background & Gecko Support
> "will it work on firefox?"

### 9. Word Undo (Ctrl + Backspace)
> "allow ctrl+backspace"

### 10. Persistent Highlight Memory & Clear Shortcuts
> "remember highlight, so when accidently or purposefully tab/shift tab go back to previous highlight, allow ctrl+shift+backspace to clear current paragraph, c-s-backspace twice to clear all highlight"

### 11. Lenient Special Character & Bracket Typing
> "allow special character like brackets, etc typing if it is previous character when auto skipping"

### 12. AGENTS.md
> "add AGENTS.md with my verbatim requests at top of the page all requested changes including inception. Then agent deserved project info, so you are up to date as well as we have change request tracking, even when there is no session info or different pc."

---

## Agent Deserved Project Info & Technical Architecture

### Overview
**PageTyper** is a cross-browser browser extension (Chromium / Edge / Firefox / Safari WebExtensions) that converts any webpage into an interactive typing tutor. It lets users practice typing directly on live content (articles, documentation, code walkthroughs) with relaxed, smart-matching rules.

### Core File Structure
```
PageTyper/
├── manifest.json         # Manifest V3 configuration supporting Chrome, Edge, Safari, and Firefox
├── background.js        # Background service worker / script with cross-browser API shim
├── content/
│   ├── content.js       # Core typing engine, event capture, DOM highlighting, stats tracking
│   └── styles.css       # Visual styling for cursor, typed characters, typo popup, HUD, tooltip
├── popup/
│   ├── popup.html       # Extension popup menu with toggles & shortcut cheat sheet
│   └── popup.js         # Settings sync with chrome.storage / browser.storage
├── icons/               # 16x16, 48x48, 128x128 extension icons
├── README.md            # User-facing installation guide, controls, and features
└── AGENT.md             # This persistent context and change-request history document
```

### Critical Architectural Invariants & Mechanics

1. **Smart Text Mode (Relaxed)**:
   - Evaluates characters using `normalizeChar()` (case-insensitive by default).
   - In text-only mode (`ignorePunctuation: true`), non-alphanumeric characters, spaces, and punctuation are automatically bypassed by `skipNonTypingChars()`.
   - **Lenient Special Character Typing**: If punctuation or brackets (`()`, `[]`, `{}`, quotes, colons) were just auto-skipped, typing them naturally absorbs the keystroke without triggering a typo.

2. **Intelligent Spacebar Intent Detection**:
   - **Absorb Auto-Skipped Space**: When a word finishes, `skipNonTypingChars()` auto-advances across the whitespace to the next word. A space pressed immediately afterward (`justAutoSkippedSpace === true`) is treated as natural muscle-memory space and absorbed without skipping the next word.
   - **Intentional Word-Skipping**:
     - At index 0 (first character of block): Space skips the first word.
     - Pressing space again when cursor is already on the first character of a word: skips that word.
     - Pressing space mid-word (after typing 1+ letters): skips the rest of that word.

3. **Block Selection & Traversal**:
   - `scanTextBlocks()` collects candidate text blocks (`p`, `h1-h6`, `li`, `blockquote`, `article`).
   - <kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> uses capture-phase listeners with `stopImmediatePropagation()` and `preventDefault()` to prevent native browser focus-stealing.
   - Selecting text with the mouse or keyboard (`mouseup` / `keyup` with Shift) automatically switches active focus to that selected container.
   - Text blocks are sorted by document order (`compareDocumentPosition`) so DOM order remains deterministic.

4. **Highlight Memory & Progress Retention**:
   - `blockProgressMap` (Map<HTMLElement, number>) stores `targetIndex` progress per block.
   - Switching away from a block keeps span elements and `.pagetyper-typed` styles visible on page.
   - Returning to a block restores cursor position and typed state.

5. **Reset & Undo Keybindings**:
   - <kbd>Backspace</kbd>: Undoes single character (rewinds over intervening auto-skipped punctuation).
   - <kbd>Ctrl</kbd> + <kbd>Backspace</kbd> / <kbd>Alt</kbd> + <kbd>Backspace</kbd>: Undoes the entire preceding word in one stroke.
   - <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Backspace</kbd>: Resets highlights and restarts typing on the active paragraph.
   - <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Backspace</kbd> (twice within 650ms): Clears all highlights across the entire document.

6. **Real-time Metrics & HUD**:
   - Floating HUD tracks Block #, WPM, and Accuracy %.
   - `charStats` tracks per-character `{ attempts, errors }`.
   - Hovering over Accuracy reveals `.pt-accuracy-tooltip`, listing worst-performing letters sorted by highest error rate descending.

7. **Cross-Browser Manifest V3 Compatibility**:
   - Manifest includes `browser_specific_settings.gecko` for Firefox MV3.
   - Background key in `manifest.json` specifies both `"scripts": ["background.js"]` (Firefox) and `"service_worker": "background.js"` (Chromium/Safari).
   - Scripts check `typeof browser !== 'undefined' ? browser : chrome`.
