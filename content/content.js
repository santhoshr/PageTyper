/**
 * PageTyper - Content Script
 * Allows user to practice typing on any webpage text content.
 * Features:
 *  - Tab / Shift+Tab to navigate text blocks on page
 *  - Auto scroll & auto-focus next content as user types
 *  - Highlights typed text
 *  - Shows typo popup on top of mistaken character
 *  - Initial Mode: Text only (ignores case, punctuation, non-alphanumeric, auto-advances spaces)
 */

(function () {
  // Prevent duplicate execution
  if (window.__PAGE_TYPER_INITIALIZED__) return;
  window.__PAGE_TYPER_INITIALIZED__ = true;

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  let isEnabled = true;
  let textBlocks = [];
  let currentBlockIndex = -1;
  let originalHtmlMap = new Map(); // Store original innerHTML to restore smoothly

  // Typing state for active block
  let activeElement = null;
  let targetChars = []; // Array of { char: string, isAlphaNum: boolean, normChar: string, spanNode: HTMLElement }
  let targetIndex = 0; // Current character index in targetChars
  let typoTooltip = null;
  let hudElement = null;
  let justAutoSkippedSpace = false; // Tracks if cursor just landed via auto-skip from typed character

  // History tracking per block element: stores targetIndex progress across Tab / Shift+Tab
  const blockProgressMap = new Map(); // Map<HTMLElement, number>
  let lastCtrlShiftBackspaceTime = 0; // For detecting double C-S-Backspace to clear all

  // Stats
  let totalCharsTyped = 0;
  let errorsCount = 0;
  let startTime = null;

  // Key-specific statistics tracking: { attempts: number, errors: number }
  const charStats = new Map();

  function recordCharAttempt(expectedChar, isError) {
    const key = expectedChar.toLowerCase();
    if (!charStats.has(key)) {
      charStats.set(key, { attempts: 0, errors: 0 });
    }
    const stat = charStats.get(key);
    stat.attempts++;
    if (isError) {
      stat.errors++;
    }
  }

  // Settings
  let config = {
    ignorePunctuation: true,
    ignoreCase: true,
    autoScroll: true,
  };

  // Load config
  browserAPI.storage?.sync?.get(['pageTyperConfig'], (result) => {
    if (result && result.pageTyperConfig) {
      config = { ...config, ...result.pageTyperConfig };
    }
  });

  // Listen for messages from popup or background
  browserAPI.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOGGLE_PAGETYPER') {
      isEnabled = !isEnabled;
      if (!isEnabled) {
        disablePageTyper();
      } else {
        enablePageTyper();
      }
      sendResponse({ status: isEnabled });
    } else if (message.action === 'GET_STATUS') {
      sendResponse({ isEnabled, currentBlockIndex, totalBlocks: textBlocks.length });
    } else if (message.action === 'UPDATE_CONFIG') {
      config = { ...config, ...message.config };
      sendResponse({ status: 'ok' });
    }
  });

  // Collect suitable readable text containers
  function scanTextBlocks() {
    // Standard content tags
    const selector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, article, section > p';
    const elements = Array.from(document.querySelectorAll(selector));

    textBlocks = elements.filter((el) => {
      // Must be visible
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        el.offsetParent === null
      ) {
        return false;
      }
      // Must have readable text
      const text = el.innerText ? el.innerText.trim() : '';
      if (text.length < 5) return false;

      // Avoid editable or script elements
      if (el.isContentEditable || el.closest('input, textarea, [contenteditable="true"]')) {
        return false;
      }

      // Avoid nested containers if children are already detected
      const hasBlockChildren = el.querySelector('p, h1, h2, h3, h4, h5, h6, li');
      if (hasBlockChildren) return false;

      return true;
    });

    console.log(`[PageTyper] Discovered ${textBlocks.length} readable text blocks.`);
  }

  function createHUD() {
    if (hudElement) return;
    hudElement = document.createElement('div');
    hudElement.id = 'pagetyper-hud';
    hudElement.innerHTML = `
      <span class="pt-badge">PageTyper</span>
      <div class="pt-stats">
        <span class="pt-stat-item">Block: <span class="pt-stat-value" id="pt-hud-block">0/0</span></span>
        <span class="pt-stat-item">WPM: <span class="pt-stat-value" id="pt-hud-wpm">0</span></span>
        <span class="pt-stat-item pt-stat-item-interactive" id="pt-hud-acc-container">
          Accuracy: <span class="pt-stat-value" id="pt-hud-acc">100%</span>
          <div class="pt-accuracy-tooltip" id="pt-hud-acc-tooltip">
            <div class="pt-accuracy-title">
              <span>Worst Keys (Error %)</span>
              <span id="pt-hud-acc-total-errors">0 errors</span>
            </div>
            <div class="pt-accuracy-list" id="pt-hud-acc-list">
              <span style="color: #64748b;">No errors recorded yet! 🎯</span>
            </div>
          </div>
        </span>
      </div>
      <span class="pt-hint">Tab / Shift+Tab to jump block • Esc to exit</span>
    `;
    document.body.appendChild(hudElement);
  }

  function updateHUD() {
    if (!hudElement) return;
    const blockEl = document.getElementById('pt-hud-block');
    const wpmEl = document.getElementById('pt-hud-wpm');
    const accEl = document.getElementById('pt-hud-acc');
    const accListEl = document.getElementById('pt-hud-acc-list');
    const totalErrorsEl = document.getElementById('pt-hud-acc-total-errors');

    if (blockEl) blockEl.textContent = `${currentBlockIndex + 1}/${textBlocks.length}`;

    if (startTime && totalCharsTyped > 0) {
      const minutes = Math.max((Date.now() - startTime) / 60000, 0.05);
      const wpm = Math.round(totalCharsTyped / 5 / minutes);
      if (wpmEl) wpmEl.textContent = `${wpm}`;
      const accuracy = Math.max(0, Math.round(((totalCharsTyped - errorsCount) / totalCharsTyped) * 100));
      if (accEl) accEl.textContent = `${accuracy}%`;
    }

    if (totalErrorsEl) {
      totalErrorsEl.textContent = `${errorsCount} error${errorsCount === 1 ? '' : 's'}`;
    }

    // Populate worst error keys in tooltip
    if (accListEl) {
      const errorsList = [];
      charStats.forEach((val, key) => {
        if (val.errors > 0) {
          const rate = Math.round((val.errors / val.attempts) * 100);
          errorsList.push({
            char: key === ' ' ? 'Space' : key,
            rate: rate,
            errors: val.errors,
            attempts: val.attempts,
          });
        }
      });

      // Sort from worst error rate descending
      errorsList.sort((a, b) => b.rate - a.rate || b.errors - a.errors);

      if (errorsList.length === 0) {
        accListEl.innerHTML = '<span style="color: #64748b;">No errors recorded yet! 🎯</span>';
      } else {
        const topErrors = errorsList.slice(0, 7); // Show top 7 worst keys
        accListEl.innerHTML = topErrors
          .map(
            (item) => `
          <div class="pt-accuracy-row">
            <span class="pt-key-badge">${item.char}</span>
            <span><strong class="pt-error-rate">${item.rate}%</strong> (${item.errors}/${item.attempts})</span>
          </div>
        `
          )
          .join('');
      }
    }
  }

  function isAlphanumeric(char) {
    return /^[a-z0-9]$/i.test(char);
  }

  function normalizeChar(char) {
    if (config.ignoreCase) {
      return char.toLowerCase();
    }
    return char;
  }

  // Activate and wrap text elements for typing
  function selectBlock(index, forward = true) {
    if (textBlocks.length === 0) scanTextBlocks();
    if (textBlocks.length === 0) return;

    // Save progress of the block we are leaving
    if (activeElement) {
      blockProgressMap.set(activeElement, targetIndex);
      activeElement.classList.remove('pagetyper-active-block');
      // Keep DOM spans intact so typed progress and highlight colors stay visible on the page!
    }

    // Refresh valid/attached elements in case DOM altered
    textBlocks = textBlocks.filter((el) => el && el.isConnected);
    if (textBlocks.length === 0) scanTextBlocks();
    if (textBlocks.length === 0) return;

    if (index >= textBlocks.length) {
      index = 0; // Loop or finish
    } else if (index < 0) {
      index = textBlocks.length - 1;
    }

    currentBlockIndex = index;
    activeElement = textBlocks[currentBlockIndex];
    if (!activeElement) return;

    activeElement.classList.add('pagetyper-active-block');

    if (config.autoScroll) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Prepare or restore characters for this block
    prepareBlockForTyping(activeElement);
    updateHUD();
  }

  function prepareBlockForTyping(el) {
    // If element already has spans prepared, just restore existing state and targetChars
    if (originalHtmlMap.has(el)) {
      const spans = el.querySelectorAll('.pagetyper-char');
      if (spans.length > 0) {
        targetChars = [];
        const fullText = el.innerText || '';
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          const char = span.textContent;
          targetChars.push({
            char: char,
            isAlphaNum: isAlphanumeric(char),
            normChar: normalizeChar(char),
            spanNode: span,
          });
        }

        // Restore saved position or default to 0
        targetIndex = blockProgressMap.get(el) || 0;
        justAutoSkippedSpace = false;
        skipNonTypingChars();
        highlightCurrent();
        return;
      }
    }

    // First time initializing this block
    originalHtmlMap.set(el, el.innerHTML);

    const fullText = el.innerText || '';
    el.innerHTML = ''; // Clear to construct interactive spans

    targetChars = [];
    targetIndex = 0;
    justAutoSkippedSpace = false;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < fullText.length; i++) {
      const char = fullText[i];
      const span = document.createElement('span');
      span.textContent = char;
      span.className = 'pagetyper-char';
      fragment.appendChild(span);

      targetChars.push({
        char: char,
        isAlphaNum: isAlphanumeric(char),
        normChar: normalizeChar(char),
        spanNode: span,
      });
    }

    el.appendChild(fragment);

    // Initial forward skip non-alphanumeric if starting in text-only mode
    skipNonTypingChars();
    highlightCurrent();
  }

  // Smart advance over punctuation / spaces / whitespace
  function skipNonTypingChars() {
    if (!config.ignorePunctuation) return;

    while (targetIndex < targetChars.length) {
      const item = targetChars[targetIndex];
      if (item.isAlphaNum) {
        break; // Stop at first alphanumeric char
      }
      // Auto-mark punctuation / space as typed / bypassed
      item.spanNode.classList.add('pagetyper-typed');
      targetIndex++;
    }
  }

  function highlightCurrent() {
    // Clear old current
    document.querySelectorAll('.pagetyper-current').forEach((node) => {
      node.classList.remove('pagetyper-current');
    });
    removeTypoTooltip();

    if (targetIndex < targetChars.length) {
      const currentItem = targetChars[targetIndex];
      currentItem.spanNode.classList.add('pagetyper-current');
      if (config.autoScroll) {
        // Keep in comfortable view if text block is very long
        const rect = currentItem.spanNode.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 50 || rect.top < 50) {
          currentItem.spanNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } else {
      // Completed current block! Auto advance to next content!
      selectBlock(currentBlockIndex + 1);
    }
  }

  function showTypoTooltip(mistakenKey, targetNode) {
    removeTypoTooltip();
    typoTooltip = document.createElement('div');
    typoTooltip.className = 'pagetyper-typo-tooltip';
    typoTooltip.textContent = `typed: '${mistakenKey}'`;
    targetNode.appendChild(typoTooltip);
  }

  function removeTypoTooltip() {
    if (typoTooltip && typoTooltip.parentNode) {
      typoTooltip.parentNode.removeChild(typoTooltip);
    }
    typoTooltip = null;
  }

  // Handle typing input
  function handleKeyDown(e) {
    if (!isEnabled) return;

    // Block selection via Tab / Shift+Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.shiftKey) {
        selectBlock(currentBlockIndex - 1, false);
      } else {
        selectBlock(currentBlockIndex + 1, true);
      }
      return;
    }

    // Quick toggle / escape
    if (e.key === 'Escape') {
      disablePageTyper();
      return;
    }

    // Handle Backspace (Single char undo), Ctrl+Backspace (Word undo), & Ctrl+Shift+Backspace (Clear paragraph / Clear all)
    if (e.key === 'Backspace') {
      e.preventDefault();
      removeTypoTooltip();

      // Check for Ctrl+Shift+Backspace (or Cmd+Shift+Backspace / Alt+Shift+Backspace)
      if ((e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey) {
        const now = Date.now();
        const isDoublePress = (now - lastCtrlShiftBackspaceTime) < 650; // Pressed twice within 650ms
        lastCtrlShiftBackspaceTime = now;

        if (isDoublePress) {
          // Double press: Clear all highlights across the entire document!
          blockProgressMap.clear();
          textBlocks.forEach((block) => {
            if (originalHtmlMap.has(block)) {
              block.innerHTML = originalHtmlMap.get(block);
              originalHtmlMap.delete(block);
            }
            block.classList.remove('pagetyper-active-block');
          });
          document.querySelectorAll('.pagetyper-current, .pagetyper-typed').forEach((n) => {
            n.classList.remove('pagetyper-current', 'pagetyper-typed');
          });
          targetChars = [];
          targetIndex = 0;
          if (activeElement) {
            prepareBlockForTyping(activeElement);
          }
        } else {
          // Single press: Clear current paragraph highlight & reset index to 0
          if (activeElement) {
            blockProgressMap.delete(activeElement);
            targetChars.forEach((item) => {
              item.spanNode.classList.remove('pagetyper-typed', 'pagetyper-current');
            });
            targetIndex = 0;
            justAutoSkippedSpace = false;
            skipNonTypingChars();
            highlightCurrent();
          }
        }

        updateHUD();
        return;
      }

      if (targetIndex > 0) {
        if (e.ctrlKey || e.altKey) {
          // Rewind over any intervening non-alphanumeric chars (spaces/punctuation)
          while (targetIndex > 0 && config.ignorePunctuation && !targetChars[targetIndex - 1].isAlphaNum) {
            targetIndex--;
            targetChars[targetIndex].spanNode.classList.remove('pagetyper-typed');
          }
          // Rewind the entire previous word
          while (targetIndex > 0 && targetChars[targetIndex - 1].isAlphaNum) {
            targetIndex--;
            targetChars[targetIndex].spanNode.classList.remove('pagetyper-typed');
          }
        } else {
          // Single character Backspace
          targetIndex--;
          // If we skipped punctuation, rewind back over it
          while (targetIndex > 0 && config.ignorePunctuation && !targetChars[targetIndex].isAlphaNum) {
            targetChars[targetIndex].spanNode.classList.remove('pagetyper-typed');
            targetIndex--;
          }
          targetChars[targetIndex].spanNode.classList.remove('pagetyper-typed');
        }

        justAutoSkippedSpace = false;
        highlightCurrent();
        updateHUD();
      }
      return;
    }

    // Ignore function keys, control, alt, meta, etc.
    if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) {
      return;
    }

    if (!activeElement || targetIndex >= targetChars.length) {
      return;
    }

    // Start timer on first keypress
    if (!startTime) {
      startTime = Date.now();
    }

    e.preventDefault(); // Stop default page scrolling on Space etc.

    const typedChar = e.key;

    // Smart & Lenient Space handling:
    // User intentions with Space:
    // 1. If user just finished typing a word and the auto-skip moved cursor over the space to the next word:
    //    User's muscle-memory space was meant for that auto-skipped space! Absorb it cleanly without skipping the next word.
    // 2. If user is at the first character of paragraph: Space means skip this word!
    // 3. If previous character was already space and we are on first character of next word (or subsequent space press):
    //    Another space means user deliberately wants to SKIP the word!
    // 4. If user is in the middle of a word (previous character was alphanumeric):
    //    Space means skip the remainder of this word!
    if (e.code === 'Space' || typedChar === ' ') {
      removeTypoTooltip();

      const currentItem = targetChars[targetIndex];

      if (currentItem && currentItem.isAlphaNum) {
        const isFirstCharOfWord = targetIndex === 0 || !targetChars[targetIndex - 1].isAlphaNum;

        if (isFirstCharOfWord && justAutoSkippedSpace) {
          // Case 1: User just finished typing previous word; auto-skip already jumped the space.
          // This space keypress was meant for that auto-skipped space, so absorb it without skipping!
          justAutoSkippedSpace = false;
          return;
        }

        // Case 2, 3 & 4:
        // - At index 0 (first char in paragraph): user wants to skip this word!
        // - Another space pressed when already on first character of next word: skip this word!
        // - In the middle of word: skip remainder of this word!
        justAutoSkippedSpace = false;
        while (targetIndex < targetChars.length && targetChars[targetIndex].isAlphaNum) {
          targetChars[targetIndex].spanNode.classList.remove('pagetyper-current');
          targetChars[targetIndex].spanNode.classList.add('pagetyper-typed');
          targetIndex++;
        }
      } else if (currentItem && !currentItem.isAlphaNum) {
        justAutoSkippedSpace = false;
        currentItem.spanNode.classList.remove('pagetyper-current');
        currentItem.spanNode.classList.add('pagetyper-typed');
        targetIndex++;
      }

      // Skip past any whitespace/punctuation to cleanly land on next readable word
      skipNonTypingChars();
      highlightCurrent();
      updateHUD();
      return;
    }

    const currentTarget = targetChars[targetIndex];
    const expected = currentTarget.normChar;
    const actual = normalizeChar(typedChar);

    // Lenient special character / bracket typing:
    // If the engine auto-skipped punctuation/brackets/special characters right before this cursor position,
    // and the user naturally types that special character (e.g., closing bracket ')', ']', '}', quote, comma, etc.),
    // safely accept/absorb it without triggering a typo!
    if (actual !== expected && !isAlphanumeric(typedChar)) {
      // Check if typedChar matches any of the recently auto-skipped characters immediately preceding targetIndex
      let matchedPrevIndex = -1;
      for (let i = targetIndex - 1; i >= 0; i--) {
        if (targetChars[i].isAlphaNum) break; // Don't look past the previous word
        if (normalizeChar(targetChars[i].char) === actual) {
          matchedPrevIndex = i;
          break;
        }
      }

      if (matchedPrevIndex !== -1) {
        // User typed the auto-skipped special character/bracket!
        removeTypoTooltip();
        targetChars[matchedPrevIndex].spanNode.classList.add('pagetyper-typed');
        return; // Absorb cleanly without penalizing accuracy
      }
    }

    totalCharsTyped++;

    if (actual === expected) {
      // Correct!
      recordCharAttempt(expected, false);
      removeTypoTooltip();
      currentTarget.spanNode.classList.remove('pagetyper-current');
      currentTarget.spanNode.classList.add('pagetyper-typed');
      targetIndex++;

      // Check if subsequent characters contain space/punctuation that will be auto-skipped
      const beforeSkipIndex = targetIndex;
      skipNonTypingChars();
      // If we skipped any space/punctuation after typing this character, mark justAutoSkippedSpace = true
      justAutoSkippedSpace = targetIndex > beforeSkipIndex;

      highlightCurrent();
    } else {
      // Mistake / Typo!
      justAutoSkippedSpace = false;
      recordCharAttempt(expected, true);
      errorsCount++;
      showTypoTooltip(typedChar, currentTarget.spanNode);
    }

    updateHUD();
  }

  function enablePageTyper() {
    isEnabled = true;
    scanTextBlocks();
    createHUD();
    if (hudElement) hudElement.classList.remove('pt-hidden');
    if (currentBlockIndex === -1 && textBlocks.length > 0) {
      selectBlock(0);
    }
  }

  function disablePageTyper() {
    isEnabled = false;
    if (hudElement) hudElement.classList.add('pt-hidden');
    removeTypoTooltip();
    if (activeElement) {
      activeElement.classList.remove('pagetyper-active-block');
      if (originalHtmlMap.has(activeElement)) {
        activeElement.innerHTML = originalHtmlMap.get(activeElement);
        originalHtmlMap.delete(activeElement);
      }
      activeElement = null;
    }
    document.querySelectorAll('.pagetyper-current').forEach((n) => n.classList.remove('pagetyper-current'));
  }

  // Register event listeners
  window.addEventListener('keydown', handleKeyDown, true);

  // Intelligently reset typing block to selected text or paragraph
  function handleSelectionChange() {
    if (!isEnabled) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const selectedText = selection.toString().trim();
    if (selectedText.length < 2) return;

    const targetNode = startContainer.nodeType === Node.TEXT_NODE ? startContainer.parentElement : startContainer;
    if (!targetNode || !(targetNode instanceof Element)) return;

    // Check if target is inside the HUD or input elements
    if (targetNode.closest('#pagetyper-hud, input, textarea, [contenteditable="true"]')) return;

    // Refresh candidate blocks if needed
    if (textBlocks.length === 0) scanTextBlocks();

    // 1. Direct match with existing known text blocks
    let matchedIndex = textBlocks.findIndex((block) => block === targetNode || block.contains(targetNode));

    // 2. Fallback: Find closest semantic block container (p, li, h1-h6, blockquote, etc.)
    if (matchedIndex === -1) {
      const containerBlock = targetNode.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, article');
      if (containerBlock) {
        matchedIndex = textBlocks.indexOf(containerBlock);
        if (matchedIndex === -1 && !textBlocks.includes(containerBlock)) {
          // If not in textBlocks, find right position in DOM order
          textBlocks.push(containerBlock);
          textBlocks.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
          matchedIndex = textBlocks.indexOf(containerBlock);
        }
      }
    }

    if (matchedIndex !== -1 && matchedIndex !== currentBlockIndex) {
      // Clear visual browser highlight selection so typing highlights take over cleanly
      selection.removeAllRanges();
      selectBlock(matchedIndex);
    }
  }

  // Trigger block switch when user finishes mouse or keyboard text selection
  window.addEventListener('mouseup', handleSelectionChange, true);
  window.addEventListener('keyup', (e) => {
    if (e.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      handleSelectionChange();
    }
  }, true);

  // Initialize
  window.addEventListener('DOMContentLoaded', () => {
    scanTextBlocks();
    createHUD();
    if (textBlocks.length > 0) {
      selectBlock(0);
    }
  });

  // If already loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    scanTextBlocks();
    createHUD();
    if (textBlocks.length > 0) {
      selectBlock(0);
    }
  }
})();
