# PageTyper Extension ⌨️

**PageTyper** is a cross-browser extension (Edge, Chrome, Firefox, Safari) that turns any webpage into an interactive typing tutor. Practice typing on actual articles, documentation, or blog posts.

---

## ✨ Features

- **Cross-Browser Manifest V3**: Compatible with Microsoft Edge, Google Chrome, Mozilla Firefox, and Apple Safari (via Safari Web Extension Converter or WebExtensions API).
- **Interactive Block Selection (<kbd>Tab</kbd> / <kbd>Shift + Tab</kbd>)**:
  - Press <kbd>Tab</kbd> to cycle forward through paragraphs, headings, and article content.
  - Press <kbd>Shift + Tab</kbd> to navigate backwards.
- **Smart Initial Mode (Text-Only / Relaxed)**:
  - Ignores punctuation, non-alphanumeric characters, and character casing.
  - As soon as you finish a word or section, subsequent punctuation and spaces automatically advance and highlight.
- **Typo Popup Indicator**:
  - When a wrong character is pressed, a red tooltip popup appears directly above the mistake showing `typed: '<key>'`.
- **Typing Progress & Highlighting**:
  - Correctly typed text is smoothly highlighted with soft green.
  - The current character is highlighted with an active glowing cursor.
- **Auto-Scrolling & Auto-Advancing**:
  - Automatically scrolls down smoothly as you type.
  - When a block is completed, it immediately selects and scrolls to the next paragraph automatically.
- **Floating HUD**:
  - Displays real-time WPM, Accuracy %, and Block progress.
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
| <kbd>Tab</kbd> | Move to next text block on the page |
| <kbd>Shift</kbd> + <kbd>Tab</kbd> | Move to previous text block on the page |
| <kbd>Backspace</kbd> | Undo last typed character |
| <kbd>Esc</kbd> | Deactivate PageTyper typing mode |
| Typing any key | Practice typing the currently active block |
