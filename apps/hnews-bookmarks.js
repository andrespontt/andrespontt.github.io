/* Shared by the reader and the full comment-thread page. No account required. */
(() => {
  'use strict';
  const DB_NAME = 'hnews-reader';
  const STORE = 'bookmarks';
  const items = new Map();
  let bookmarks = new Map();
  let db;
  let available = false;
  let refreshVersion = 0;
  let storageVersion = 0;
  let channel;
  let noticeTimer;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function plainText(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    template.content.querySelectorAll('script, style').forEach(el => el.remove());
    template.content.querySelectorAll('p, br, pre, li').forEach(el => el.before('\n'));
    return template.content.textContent.trim();
  }

  function readerUrl(item) {
    const url = new URL('hnews.html', location.href);
    const params = new URLSearchParams();
    if (item.type !== 'comment') params.set('item', item.id);
    else {
      if (item.storyId) params.set('item', item.storyId);
      params.set('comment', item.id);
    }
    url.hash = params.toString();
    return url.href;
  }

  function remember(item, story = null) {
    const id = Number(item.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid item ID');
    const type = item.type === 'comment' || item.parent ? 'comment' : 'story';
    const record = {
      id, type, author: item.by || 'unknown',
      title: type === 'comment' ? (story?.title ? plainText(story.title) : `Comment by ${item.by || 'unknown'}`) : plainText(item.title || 'Untitled post'),
      text: plainText(item.text),
      storyId: type === 'story' ? id : (story?.id || null),
      time: item.time || 0
    };
    items.set(id, record);
    return record;
  }

  function actions(item, story = null) {
    const record = remember(item, story);
    const saved = bookmarks.has(record.id);
    return `<div class="bookmark-actions">
      <button type="button" class="bookmark-button" data-bookmark-id="${record.id}" aria-pressed="${saved}" ${available ? '' : 'disabled'}>${saved ? '★ saved' : '☆ save'}</button>
      <button type="button" class="bookmark-button" data-copy-id="${record.id}">copy reader link</button>
      ${record.type === 'story' ? `<button type="button" class="bookmark-button" data-copy-hn-id="${record.id}" title="Copy the original Hacker News post URL">copy HN link</button>` : ''}
    </div>`;
  }

  function notify(message, error = false) {
    let status = document.getElementById('bookmarkStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'bookmarkStatus';
      status.className = 'bookmark-status';
      status.setAttribute('role', 'status');
      document.body.append(status);
    }
    clearTimeout(noticeTimer);
    status.hidden = false;
    status.classList.toggle('is-error', error);
    status.textContent = message;
    noticeTimer = setTimeout(() => { status.hidden = true; }, error ? 10000 : 4000);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => {
        const connection = request.result;
        connection.onversionchange = () => {
          connection.close();
          available = false;
          syncButtons();
          notify('Bookmark storage changed in another tab. Reload this page to continue.', true);
        };
        resolve(connection);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => notify('Close other HN reader tabs, then reload to open bookmark storage.', true);
    });
  }

  async function refresh() {
    if (!db || !available) return;
    const version = ++refreshVersion;
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('Could not read bookmarks'));
      tx.onerror = () => {};
    });
    if (version !== refreshVersion) return;
    bookmarks = new Map(records.map(record => [record.id, record]));
    syncButtons();
    render();
  }

  function syncButtons() {
    document.querySelectorAll('[data-bookmark-id]').forEach(button => {
      const saved = bookmarks.has(Number(button.dataset.bookmarkId));
      button.textContent = saved ? '★ saved' : '☆ save';
      button.setAttribute('aria-pressed', String(saved));
      button.disabled = !available;
    });
    document.querySelectorAll('[data-bookmark-count]').forEach(el => { el.textContent = bookmarks.size; });
  }

  // Read and write in one transaction so separate tabs cannot overwrite each other's saves.
  function changeBookmark(id, removeOnly = false) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      let saved = false;
      request.onsuccess = () => {
        if (request.result || removeOnly) store.delete(id);
        else {
          const record = items.get(id);
          if (!record) { tx.abort(); return; }
          store.put({ ...record, savedAt: Date.now() });
          saved = true;
        }
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = () => reject(tx.error || new Error('Bookmark change failed'));
      tx.onerror = () => {};
    });
  }

  function sortedBookmarks() {
    return [...bookmarks.values()].sort((a, b) => b.savedAt - a.savedAt || b.id - a.id);
  }

  function exportText() {
    return sortedBookmarks().map(item => [
      `${item.type === 'comment' ? 'COMMENT' : 'POST'}: ${item.title}`,
      `By ${item.author} · saved ${new Date(item.savedAt).toISOString()}`,
      readerUrl(item), item.text
    ].filter(Boolean).join('\n')).join('\n\n──────────\n\n');
  }

  async function copy(text, success, title = 'Copy link') {
    try {
      await navigator.clipboard.writeText(text);
      notify(success);
    } catch {
      let dialog = document.getElementById('bookmarkCopyDialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'bookmarkCopyDialog';
        dialog.className = 'bookmark-copy-dialog';
        dialog.setAttribute('aria-labelledby', 'bookmarkCopyTitle');
        dialog.innerHTML = `<h2 id="bookmarkCopyTitle"></h2>
          <p>Clipboard access is unavailable. Select and copy the text below.</p>
          <textarea aria-label="Text to copy" readonly></textarea>
          <form method="dialog"><button class="bookmark-button">close</button></form>`;
        document.body.append(dialog);
      }
      dialog.querySelector('h2').textContent = title;
      dialog.querySelector('textarea').value = text;
      dialog.showModal();
      dialog.querySelector('textarea').select();
    }
  }

  function bytes(value) {
    if (value < 1024) return `${Math.round(value)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let index = -1;
    do { value /= 1024; index++; } while (value >= 1024 && index < units.length - 1);
    return `${value.toFixed(1)} ${units[index]}`;
  }

  async function renderStorage() {
    const element = document.getElementById('bookmarkStorage');
    if (!element) return;
    const version = ++storageVersion;
    const size = bookmarks.size ? new Blob([JSON.stringify(sortedBookmarks())]).size : 0;
    element.textContent = `Saved content: ${bytes(size)}. Space left: unavailable in this browser.`;
    const meter = document.getElementById('bookmarkStorageMeter');
    meter.hidden = true;
    try {
      const estimate = await navigator.storage?.estimate();
      if (version !== storageVersion) return;
      if (!estimate || !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage) || estimate.quota <= 0) return;
      element.textContent = `Saved content: ${bytes(size)} · Estimated space left: ${bytes(Math.max(0, estimate.quota - estimate.usage))} of ${bytes(estimate.quota)}`;
      meter.max = estimate.quota;
      meter.value = Math.min(estimate.usage, estimate.quota);
      meter.hidden = false;
    } catch { /* Keep the explicit unavailable state; never invent a quota. */ }
  }

  function render() {
    const list = document.getElementById('bookmarksList');
    if (!list) return;
    const records = sortedBookmarks();
    document.getElementById('copyAllBookmarks').disabled = !records.length;
    if (!available) {
      list.innerHTML = '<p class="bookmark-empty">Bookmark storage is unavailable. Allow site storage and reload to try again.</p>';
    } else if (!records.length) {
      list.innerHTML = '<p class="bookmark-empty">No bookmarks yet. Use ☆ save on any post or comment.</p>';
    } else {
      list.innerHTML = records.map(item => `<article class="bookmark-card" data-saved-id="${item.id}">
        <div class="bookmark-kind">${item.type === 'comment' ? 'comment' : 'post'} · by ${escape(item.author)} · saved ${escape(new Date(item.savedAt).toLocaleDateString())}</div>
        <h3><a href="${escape(readerUrl(item))}">${escape(item.title)}</a></h3>
        ${item.text ? `<details><summary>Saved text</summary><p class="bookmark-text">${escape(item.text)}</p></details>` : ''}
        <div class="bookmark-actions">
          <a class="bookmark-button" href="${escape(readerUrl(item))}">${item.type === 'comment' ? 'open at comment' : 'open post'}</a>
          <button type="button" class="bookmark-button" data-copy-id="${item.id}">copy link</button>
          <button type="button" class="bookmark-button" data-remove-id="${item.id}">remove</button>
        </div>
      </article>`).join('');
    }
    renderStorage();
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-bookmark-id], [data-remove-id], [data-copy-id], [data-copy-hn-id], #copyAllBookmarks');
    if (!button) return;
    event.stopPropagation();
    if (button.id === 'copyAllBookmarks') {
      if (bookmarks.size) await copy(exportText(), `Copied ${bookmarks.size} bookmarks with saved text and reader links.`, 'Copy your bookmarks');
      return;
    }
    if (button.dataset.copyHnId) {
      await copy(`https://news.ycombinator.com/item?id=${button.dataset.copyHnId}`, 'Original HN post link copied.');
      return;
    }
    if (button.dataset.copyId) {
      const item = bookmarks.get(Number(button.dataset.copyId)) || items.get(Number(button.dataset.copyId));
      if (item) await copy(readerUrl(item), 'Reader link copied.');
      return;
    }
    if (!available || button.disabled) return;
    button.disabled = true;
    try {
      const saved = await changeBookmark(Number(button.dataset.bookmarkId || button.dataset.removeId), !!button.dataset.removeId);
      await refresh();
      channel?.postMessage('changed');
      notify(saved ? 'Bookmark saved on this device.' : 'Bookmark removed.');
    } catch (error) {
      notify(error.name === 'QuotaExceededError' ? 'Storage is full. Copy your bookmarks, then remove some to make room.' : 'Could not change this bookmark. Your saved bookmarks have been kept.', true);
    } finally { button.disabled = false; syncButtons(); }
  });

  const ready = (async () => {
    try {
      db = await openDatabase();
      available = true;
      await refresh();
      try {
        channel = new BroadcastChannel('hnews-bookmarks');
        channel.onmessage = () => refresh().catch(() => notify('Could not refresh bookmarks. Reload to try again.', true));
      } catch { /* Focus refresh also works in browsers without BroadcastChannel. */ }
    } catch {
      available = false;
      syncButtons();
      render();
      notify('Bookmarks could not open. Allow site storage and reload to try again.', true);
    }
  })();

  window.addEventListener('focus', () => ready.then(() => refresh()).catch(() => notify('Could not refresh bookmarks.', true)));
  window.HNBookmarks = { actions, readerUrl, ready, render, escape };
})();
