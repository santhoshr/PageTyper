# PageTyper Extension ⌨️

**PageTyper** is a cross-browser extension (Edge, Chrome, Firefox, Safari) that turns any webpage into an interactive typing tutor. Practice typing on actual articles, documentation, or blog posts.

---

## ✨ Features

- **Cross-Browser Manifest V3**: Compatible with Microsoft Edge, Google Chrome, Mozilla Firefox, and Apple Safari (via Safari Web Extension Converter or WebExtensions API).
- **Interactive Block Selection (<kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> / Mouse Selection)**:
  - Select or highlight any text or paragraph on the page with your mouse or keyboard, and PageTyper will automatically reset the active typing block to that section.
  - Press <kbd>Tab</kbd> to cycle forward through paragraphs, headings, and article content.
  - Press <kbd>Shift + Tab</kbd> to navigate backwards.
- **Smart Initial Mode (Text-Only / Relaxed)**:
  - Ignores punctuation, non-alphanumeric characters, and character casing.
  - **Intelligent Spacebar (Natural Typing + Word Skipping)**:
    - **Normal Typing**: Typing space at word boundaries transitions naturally to the next word.
    - **Smart Intent Detection for <kbd>Space</kbd>**:
      - **Absorbs Natural Space**: When finishing a word, our smart engine auto-skips the space/punctuation to land on the first letter of the next word. Typing <kbd>Space</kbd> right after matches your muscle-memory and absorbs cleanly without skipping the next word.
      - **Skips on First Character**: At the very start of a paragraph (first character), or pressing space when already sitting on the first letter of a word, <kbd>Space</kbd> cleanly skips that word.
      - **Skips Mid-Word**: Pressing <kbd>Space</kbd> inside an in-progress word skips the remainder of that word.
  - As soon as you finish a word or section, subsequent punctuation and spaces automatically advance and highlight.
- **Typo Popup Indicator**:
  - When a wrong character is pressed, a red tooltip popup appears directly above the mistake showing `typed: '<key>'`.
- **Typing Progress & Highlighting**:
  - Correctly typed text is smoothly highlighted with soft green.
  - The current character is highlighted with an active glowing cursor.
- **Auto-Scrolling & Auto-Advancing**:
  - Automatically scrolls down smoothly as you type.
  - When a block is completed, it immediately selects and scrolls to the next paragraph automatically.
- **Floating HUD & Accuracy Breakdown Tooltip**:
  - Displays real-time WPM, Accuracy %, and Block progress.
  - **Hover over Accuracy**: Reveals an interactive error breakdown tooltip showing your worst-performing characters and error percentages sorted from highest to lowest (e.g. `e: 25% (2/8)`).
- **Settings Popup**:
  - Toggle punctuation requirement, case sensitivity, auto-scrolling, or enable/disable on demand.

---

## 🚀 How to Install and Run

### 1. Chrome / Microsoft Edge / Brave / Opera
1. Open your browser and navigate to the extensions page:
   - **Chrome / Brave**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (or "Load unpacked extension").
4. Select the folder: `/home/santh/Developer/extn`.

### 2. Mozilla Firefox
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the [manifest.json](file:///home/santh/Developer/extn/manifest.json) file inside `/home/santh/Developer/extn`.

### 3. Apple Safari
1. Open Terminal on macOS.
2. Run Apple's extension converter:
   ```bash
   xcrun safari-web-extension-converter /path/to/extn --project-location ./PageTyperSafari
   ```
3. Open the generated Xcode project and run it in Safari.

---

## ⌨️ Controls & Shortcuts

| Key / Action | Description |
| :--- | :--- |
| <kbd>Tab</kbd> | Move to next text block on the page (preserves previous progress) |
| <kbd>Shift</kbd> + <kbd>Tab</kbd> | Move to previous text block on the page (restores previous progress) |
| <kbd>Backspace</kbd> | Undo last typed character |
| <kbd>Ctrl</kbd> + <kbd>Backspace</kbd> (or <kbd>Alt</kbd> + <kbd>Backspace</kbd>) | Undo whole previous word |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Backspace</kbd> | Clear highlight for current paragraph & restart it |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Backspace</kbd> (twice quickly) | Clear all highlights across entire document |
| <kbd>Esc</kbd> | Deactivate PageTyper typing mode |
| Typing any key | Practice typing the currently active block |
