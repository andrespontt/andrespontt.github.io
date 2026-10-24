// Browser integration checks. Requires Playwright (also available via NODE_PATH).
// Run: node tools/test-hnews.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const publicFiles = new Set(['/apps/hnews.html', '/apps/hnews_view_comment.html', '/apps/hnews-bookmarks.js', '/apps/hnews-bookmarks.css']);
const now = Math.floor(Date.now() / 1000);
const fixtures = {
  101: { id: 101, type: 'story', title: 'Test post & useful links', by: 'poster', text: '<p>Post text to keep.</p>', time: now, kids: [201, 202], descendants: 6 },
  102: { id: 102, type: 'story', title: 'A second post', by: 'other', time: now, kids: [] },
  201: { id: 201, type: 'comment', parent: 101, by: 'alice', time: now, text: '<p>A parent comment.</p>', kids: [301] },
  202: { id: 202, type: 'comment', parent: 101, by: 'bob', time: now, text: '<p>Another parent comment.</p>' },
  301: { id: 301, type: 'comment', parent: 201, by: 'carol', time: now, text: '<p>A nested reply.</p>', kids: [401] },
  401: { id: 401, type: 'comment', parent: 301, by: 'dave', time: now, text: '<p>Third level reply.</p>', kids: [501] },
  501: { id: 501, type: 'comment', parent: 401, by: 'erin', time: now, text: '<p>Deep saved comment: café &amp; tea.</p><p>Second paragraph.</p>' }
};

async function run() {
  const server = http.createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (!publicFiles.has(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(name)]);
    res.end(await fs.readFile(path.join(root, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('https://static.cloudflareinsights.com/**', route => route.abort());
    await context.route('https://hacker-news.firebaseio.com/**', route => {
      const id = /\/item\/(\d+)\.json/.exec(route.request().url());
      return route.fulfill({ json: id ? fixtures[id[1]] || null : [101, 102] });
    });
    const page = await context.newPage();
    const bookmark = id => page.locator(`[data-bookmark-id="${id}"]`).first();
    const saved = async id => page.waitForFunction(id => document.querySelector(`[data-bookmark-id="${id}"]`)?.getAttribute('aria-pressed') === 'true', id);
    await page.goto(`${base}/apps/hnews.html`);
    await page.waitForFunction(() => !document.querySelector('[data-bookmark-id="101"]')?.disabled);
    await bookmark(101).click();
    await saved(101);
    assert.equal(await page.locator('#commentsView').isVisible(), false, 'Save does not open the story');
    await page.reload();
    await saved(101);
    await page.locator('#btnBookmarks').click();
    await page.locator('[data-saved-id="101"]').waitFor();
    assert.equal(await page.locator('.feed-btn.active').count(), 0, 'Bookmarks are the active view');
    assert.match(await page.locator('#bookmarkStorage').innerText(), /Saved content:.*Estimated space left:/);
    await page.locator('[data-saved-id="101"] a').first().click();
    await page.locator('#storyHeader h2').waitFor();
    await bookmark(201).click();
    await saved(201);
    assert.equal(await page.locator('[data-comment-id="401"]').count(), 0, 'Ordinary reading still fetches two levels');

    const thread = await context.newPage();
    await thread.goto(`${base}/apps/hnews_view_comment.html?id=301`);
    await thread.locator('[data-bookmark-id="501"]').click();
    await thread.waitForFunction(() => document.querySelector('[data-bookmark-id="501"]')?.getAttribute('aria-pressed') === 'true');
    await page.locator('#btnBookmarks').click();
    await page.locator('[data-saved-id="501"]').waitFor();
    assert.match(await page.locator('[data-saved-id="501"] a').first().getAttribute('href'), /hnews\.html#comment=501$/);
    await page.locator('[data-saved-id="501"] a').first().click();
    await page.locator('[data-comment-id="501"].linked-comment').waitFor();
    assert.equal(await page.locator('#storyHeader h2').innerText(), fixtures[101].title);
    await page.waitForFunction(() => {
      const target = document.querySelector('[data-comment-id="501"]');
      const box = target.getBoundingClientRect();
      return box.top >= 0 && box.top < innerHeight;
    });
    assert.equal(await page.locator('[data-comment-id="501"] [data-bookmark-id="501"]').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await page.locator('[data-comment-id="501"].linked-comment').waitFor();
    await page.locator('#btnBookmarks').click();
    await page.locator('#copyAllBookmarks').click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(text, /Deep saved comment: café & tea\.\r?\nSecond paragraph\./);
    assert.match(text, /Post text to keep/);
    assert.match(text, /hnews\.html#comment=501/);
    assert.match(text, /hnews\.html#item=101&comment=201/);
    assert.doesNotMatch(text, /news\.ycombinator\.com/);
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts/hnews-bookmarks-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Bookmarks fit a phone');
    await page.screenshot({ path: path.join(root, 'artifacts/hnews-bookmarks-mobile.png'), fullPage: true });
    await page.locator('[data-saved-id="501"] a').first().click();
    await page.locator('[data-comment-id="501"].linked-comment').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Deep comment fits a phone');
    await page.waitForFunction(() => {
      const box = document.querySelector('[data-comment-id="501"]').getBoundingClientRect();
      return box.top >= 0 && box.top < innerHeight / 2;
    });
    await page.screenshot({ path: path.join(root, 'artifacts/hnews-comment-mobile.png') });
    await page.goBack();
    await page.locator('#bookmarksView').waitFor();
    await page.goForward();
    await page.locator('[data-comment-id="501"].linked-comment').waitFor();

    // Failed clipboard writes retain all content in a selectable fallback.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
    await page.locator('#btnBookmarks').click();
    await page.locator('#copyAllBookmarks').click();
    await page.locator('#bookmarkCopyDialog').waitFor();
    assert.match(await page.locator('#bookmarkCopyDialog textarea').inputValue(), /café & tea/);
    await page.locator('#bookmarkCopyDialog button').click();

    // Failed writes never claim a bookmark was saved or discard older records.
    await page.goto(`${base}/apps/hnews.html`);
    await saved(101);
    await page.evaluate(() => {
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(store, mode, ...args) {
        if (mode === 'readwrite') throw new DOMException('Full', 'QuotaExceededError');
        return transaction.call(this, store, mode, ...args);
      };
    });
    await bookmark(102).click();
    await page.waitForFunction(() => document.getElementById('bookmarkStatus')?.textContent.includes('Storage is full'));
    assert.equal(await bookmark(102).getAttribute('aria-pressed'), 'false');
    await page.reload();
    await saved(101);

    // Deleted ancestors remain traversable, and missing comments keep the saved snapshot.
    fixtures[401].deleted = true;
    await page.goto(`${base}/apps/hnews.html#item=101&comment=501`);
    await page.locator('[data-comment-id="501"].linked-comment').waitFor();
    delete fixtures[401].deleted;
    const removed = fixtures[501];
    fixtures[501] = null;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#commentsContainer .error')?.textContent.includes('no longer available'));
    await page.locator('#btnBookmarks').click();
    await page.locator('[data-saved-id="501"]').waitFor();
    assert.match(await page.locator('[data-saved-id="501"] details').textContent(), /café & tea/);
    fixtures[501] = removed;

    // Bookmarks remain accessible when HN cannot be reached.
    await context.route('https://hacker-news.firebaseio.com/**', route => route.abort());
    await page.goto(`${base}/apps/hnews.html#bookmarks`);
    await page.locator('[data-saved-id="501"]').waitFor();
    await page.locator('[data-remove-id="501"]').click();
    await page.locator('[data-saved-id="501"]').waitFor({ state: 'detached' });
    await thread.waitForFunction(() => document.querySelector('[data-bookmark-id="501"]')?.getAttribute('aria-pressed') === 'false');
    await page.locator('[data-remove-id="201"]').click();
    await page.locator('[data-saved-id="201"]').waitFor({ state: 'detached' });
    await page.locator('[data-remove-id="101"]').click();
    await page.waitForFunction(() => document.querySelector('#bookmarksList')?.textContent.includes('No bookmarks yet'));
    assert.equal(await page.locator('#copyAllBookmarks').isDisabled(), true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#bookmarksList')?.textContent.includes('No bookmarks yet'));

    const blocked = await browser.newContext();
    await blocked.route('https://**', route => route.abort());
    await blocked.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: { open: () => { throw new Error('blocked'); } } }));
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(`${base}/apps/hnews.html#bookmarks`);
    await blockedPage.waitForFunction(() => document.querySelector('#bookmarksList')?.textContent.includes('storage is unavailable'));
    await blocked.close();
    assert.deepEqual(errors, [], 'No browser script errors');
    console.log('PASS: persistence, post/comment saves, cross-tab sync, deep links, parent resolution, mobile layout, copy-all, clipboard fallback, quota failure, deleted comments, offline API access, removal, and unavailable storage.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
