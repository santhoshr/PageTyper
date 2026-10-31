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

  // Stats
  let totalCharsTyped = 0;
  let errorsCount = 0;
  let startTime = null;

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
        <span class="pt-stat-item">Accuracy: <span class="pt-stat-value" id="pt-hud-acc">100%</span></span>
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

    if (blockEl) blockEl.textContent = `${currentBlockIndex + 1}/${textBlocks.length}`;

    if (startTime && totalCharsTyped > 0) {
      const minutes = Math.max((Date.now() - startTime) / 60000, 0.05);
      const wpm = Math.round(totalCharsTyped / 5 / minutes);
      if (wpmEl) wpmEl.textContent = `${wpm}`;
      const accuracy = Math.max(0, Math.round(((totalCharsTyped - errorsCount) / totalCharsTyped) * 100));
      if (accEl) accEl.textContent = `${accuracy}%`;
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

    // Remove previous block wrapping/decorations
    if (activeElement) {
      activeElement.classList.remove('pagetyper-active-block');
      if (originalHtmlMap.has(activeElement)) {
        // Leave typed block as plain text or restore original
        activeElement.innerHTML = originalHtmlMap.get(activeElement);
        originalHtmlMap.delete(activeElement);
      }
    }

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

    // Prepare characters
    prepareBlockForTyping(activeElement);
    updateHUD();
  }

  function prepareBlockForTyping(el) {
    originalHtmlMap.set(el, el.innerHTML);

    const fullText = el.innerText || '';
    el.innerHTML = ''; // Clear to construct interactive spans

    targetChars = [];
    targetIndex = 0;

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

    // Ignore function keys, control, alt, meta, etc.
    if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) {
      // Allow Backspace to undo last character
      if (e.key === 'Backspace' && targetIndex > 0) {
        e.preventDefault();
        removeTypoTooltip();
        targetIndex--;
        // If we skipped punctuation, rewind back over it
        while (targetIndex > 0 && config.ignorePunctuation && !targetChars[targetIndex].isAlphaNum) {
          targetChars[targetIndex].spanNode.classList.remove('pagetyper-typed');
          targetIndex--;
        }
        targetChars[targetIndex].spanNode.classList.remove('pagetyper-typed');
        highlightCurrent();
      }
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
    const currentTarget = targetChars[targetIndex];
    const expected = currentTarget.normChar;
    const actual = normalizeChar(typedChar);

    totalCharsTyped++;

    if (actual === expected) {
      // Correct!
      removeTypoTooltip();
      currentTarget.spanNode.classList.remove('pagetyper-current');
      currentTarget.spanNode.classList.add('pagetyper-typed');
      targetIndex++;

      // Auto-skip subsequent punctuation, spaces, etc.
      skipNonTypingChars();
      highlightCurrent();
    } else {
      // Mistake / Typo!
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
        if (matchedIndex === -1) {
          // If not in textBlocks, dynamically add it
          textBlocks.push(containerBlock);
          matchedIndex = textBlocks.length - 1;
        }
      }
    }

    if (matchedIndex !== -1) {
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
