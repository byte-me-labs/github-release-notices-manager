// ===== State =====
let allNotifications = [];
let releaseUrlCache = new Map();    // subject.url -> {html_url, prerelease, tag_name, name}
let latestReleaseCache = new Map(); // repo_full -> tag_name
let freshLatestRepos = new Set();   // repos with latest fetched this session
let groups = new Map();             // repo -> notification[]
let token = '';
const BASE_URL = 'https://api.github.com';

// ===== Cache TTL =====
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const URL_CACHE_KEY = 'release_url_cache';
const LATEST_CACHE_KEY = 'latest_release_cache';
const CACHE_TIME_KEY = 'cache_timestamp';

// ===== Selection state =====
let selectedSet = new Set();      // Set<notification id>
let expandedGroups = new Set();   // Set<repoFull> — groups manually expanded by user

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);
const groupedList = $('groupedList');
const loadingEl = $('loadingIndicator');
const errorEl = $('errorMessage');
const emptyState = $('emptyState');
const statusText = $('statusText');
const countBadge = $('countBadge');
const tokenInput = $('tokenInput');
const settingsPanel = $('settingsPanel');
const toolbar = $('toolbar');
const selectAllCb = $('selectAllCb');
const selectedCount = $('selectedCount');
const markReadBtn = $('markReadBtn');
const fetchDetailsBtn = $('fetchDetailsBtn');
const expandAllBtn = $('expandAllBtn');
const markHiddenBtn = $('markHiddenBtn');
const autoMarkReadCb = $('autoMarkReadCb');
const filterMultiBtn = $('filterMultiBtn');
const selectPreBtn = $('selectPreBtn');
let autoMarkRead = false;
let filterMultiOnly = false;

// ===== i18n helper =====
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;

// ===== Cached escape HTML element =====
const _escapeEl = document.createElement('div');
function escapeHtml(str) {
  _escapeEl.textContent = str;
  return _escapeEl.innerHTML;
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.local.get(['github_token', 'auto_mark_read']);
  if (result.github_token) {
    token = result.github_token;
    tokenInput.value = token;
    fetchAllNotifications();
  } else {
    settingsPanel.classList.remove('hidden');
  }
  // Default to true; store the value so checkbox reflects it
  if (result.auto_mark_read === undefined) {
    await chrome.storage.local.set({ auto_mark_read: true });
  }
  autoMarkRead = result.auto_mark_read !== false;
  autoMarkReadCb.checked = autoMarkRead;

  // Initialize all i18n text
  applyI18nText();

  // ===== Event listeners =====
  // Delegated listeners (bound once, survive re-renders)
  groupedList.addEventListener('change', onSelectionChange);
  groupedList.addEventListener('click', onNotifLinkClick);
  groupedList.addEventListener('click', onGroupMarkRead);
  groupedList.addEventListener('click', onGroupExpand);
  groupedList.addEventListener('click', (e) => {
    // Stop propagation for clicks on checkbox labels (replaces inline onclick)
    if (e.target.closest('.notif-cb, .group-cb')) {
      e.stopPropagation();
    }
  });

  // Settings
  $('settingsToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettings();
  });
  $('saveTokenBtn').addEventListener('click', onSaveToken);
  $('clearCacheBtn').addEventListener('click', onClearCache);
  $('refreshBtn').addEventListener('click', () => {
    if (token) fetchAllNotifications();
  });

  // Selection controls
  selectAllCb.addEventListener('change', onSelectAllChange);
  expandAllBtn.addEventListener('click', onExpandAll);
  filterMultiBtn.addEventListener('click', onFilterMulti);
  selectPreBtn.addEventListener('click', onSelectPre);
  fetchDetailsBtn.addEventListener('click', fetchAllReleaseDetails);

  // Mark as read
  markHiddenBtn.addEventListener('click', onMarkHiddenRead);
  markReadBtn.addEventListener('click', onMarkRead);

  // Auto mark as read
  autoMarkReadCb.addEventListener('change', async () => {
    autoMarkRead = autoMarkReadCb.checked;
    await chrome.storage.local.set({ auto_mark_read: autoMarkRead });
  });
});

// ===== Settings panel toggle with outside-click close =====
function closeSettings() {
  settingsPanel.classList.add('hidden');
  document.removeEventListener('click', onSettingsOutsideClick);
}

function toggleSettings() {
  const isHidden = settingsPanel.classList.contains('hidden');
  if (isHidden) {
    settingsPanel.classList.remove('hidden');
    document.addEventListener('click', onSettingsOutsideClick);
  } else {
    closeSettings();
  }
}

function onSettingsOutsideClick(e) {
  const isInside = settingsPanel.contains(e.target);
  const isToggle = e.target.id === 'settingsToggle' || e.target.closest('#settingsToggle');
  if (!isInside && !isToggle) {
    closeSettings();
  }
}

// ===== i18n text application =====
function applyI18nText() {
  document.title = t('appName');
  $('appTitle').textContent = t('appName');
  $('refreshBtn').innerHTML = `&#x21bb; ${t('refresh')}`;
  $('settingsToggle').innerHTML = `&#x2699; ${t('settings')}`;
  $('tokenLabel').textContent = t('tokenLabel');
  $('saveTokenBtn').textContent = t('save');
  $('tokenHint').textContent = t('tokenHint');
  $('tokenLink').textContent = t('openSettingsPage');
  $('cacheLabel').textContent = t('cacheLabel');
  $('cacheHint').textContent = t('cacheHint');
  $('clearCacheBtn').textContent = t('clearCache');
  $('autoMarkReadLabel').textContent = t('autoMarkRead');
  $('selectAllLabel').textContent = t('selectAll');
  expandAllBtn.textContent = t('expandAll');
  markHiddenBtn.textContent = t('markHiddenRead');
  $('fetchDetailsBtn').textContent = t('fetchDetails');
  markReadBtn.textContent = t('markRead');
  $('loadingText').textContent = t('fetching');
  $('emptyText').textContent = t('noNotifs');
  filterMultiBtn.textContent = t('filterMulti');
  selectPreBtn.textContent = t('selectPre');
}

// ===== Settings handlers =====
async function onSaveToken() {
  const val = tokenInput.value.trim();
  if (!val) {
    showError(t('enterToken'));
    return;
  }
  token = val;
  await chrome.storage.local.set({ github_token: token });
  closeSettings();
  fetchAllNotifications();
}

async function onClearCache() {
  await chrome.storage.local.remove([URL_CACHE_KEY, LATEST_CACHE_KEY, CACHE_TIME_KEY]);
  releaseUrlCache = new Map();
  latestReleaseCache = new Map();
  $('clearCacheBtn').textContent = t('cleared');
  setTimeout(() => { $('clearCacheBtn').textContent = t('clearCache'); }, 2000);
  closeSettings();
  await fetchAllNotifications();
  updateStatus(t('cacheCleared'));
}

// ===== Fetch all notifications with pagination =====
async function fetchAllNotifications() {
  showLoading(true);
  hideError();
  toolbar.classList.add('hidden');
  emptyState.classList.add('hidden');
  groupedList.innerHTML = '';
  allNotifications = [];
  selectedSet.clear();

  try {
    let url = `${BASE_URL}/notifications?per_page=50&_=${Date.now()}`;
    const allItems = [];

    while (url) {
      const resp = await fetch(url, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Notices-Manager-Chrome-Ext'
        }
      });

      if (resp.status === 401) {
        throw new Error(t('tokenInvalid'));
      }
      if (resp.status === 403) {
        const reset = resp.headers.get('X-RateLimit-Reset');
        const wait = reset
          ? Math.ceil((parseInt(reset) * 1000 - Date.now()) / 1000)
          : '?';
        throw new Error(t('rateLimited', String(wait)));
      }
      if (!resp.ok) {
        throw new Error(t('requestFailed', String(resp.status), resp.statusText));
      }

      const items = await resp.json();
      if (items.length === 0) break;

      allItems.push(...items);
      updateStatus(t('fetchingNotifs', String(allItems.length)));
      url = getNextPageUrl(resp.headers.get('Link'));
    }

    allNotifications = allItems;

    // Filter to Release notifications only
    const releaseOnly = allNotifications.filter(
      n => n.subject.type === 'Release'
    );
    allNotifications = releaseOnly;

    // Load cached release URLs from storage (no API calls on load)
    await loadReleaseUrlCache();

    // Invalidate latestReleaseCache for repos that have notifications
    // without cached release details — the cached "latest" tag may be stale
    let cacheInvalidated = false;
    for (const n of allNotifications) {
      if (!releaseUrlCache.has(n.subject.url)) {
        const repo = n.repository.full_name;
        if (latestReleaseCache.has(repo)) {
          latestReleaseCache.delete(repo);
          cacheInvalidated = true;
        }
      }
    }
    if (cacheInvalidated) {
      await persistLatestReleaseCache();
    }

    updateStatus(t('totalNotifs', String(allNotifications.length)));
    countBadge.textContent = allNotifications.length;
    countBadge.classList.remove('hidden');

    if (allNotifications.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      buildGroupMap();
      renderGrouped();
      updateMarkHiddenBtn();
      toolbar.classList.remove('hidden');
      updateToolbarState();
    }
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

// ===== Build group map =====
function buildGroupMap() {
  groups = new Map();
  for (const notif of allNotifications) {
    const repo = notif.repository.full_name;
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo).push(notif);
  }
}

// ===== Parse Link header for next page =====
function getNextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const links = linkHeader.split(',').map(part => part.trim());
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

// ===== Release detail & latest cache =====

async function loadReleaseUrlCache() {
  releaseUrlCache = new Map();
  latestReleaseCache = new Map();
  freshLatestRepos = new Set();

  const stored = await chrome.storage.local.get([URL_CACHE_KEY, LATEST_CACHE_KEY, CACHE_TIME_KEY]);

  // Check cache TTL
  if (stored[CACHE_TIME_KEY] && Date.now() - stored[CACHE_TIME_KEY] > CACHE_TTL_MS) {
    // Cache expired, clear it
    await chrome.storage.local.remove([URL_CACHE_KEY, LATEST_CACHE_KEY, CACHE_TIME_KEY]);
    return;
  }

  if (stored[URL_CACHE_KEY]) {
    for (const [k, v] of Object.entries(stored[URL_CACHE_KEY])) {
      releaseUrlCache.set(k, v);
    }
  }
  if (stored[LATEST_CACHE_KEY]) {
    for (const [k, v] of Object.entries(stored[LATEST_CACHE_KEY])) {
      latestReleaseCache.set(k, v);
    }
  }
}

async function persistReleaseUrlCache() {
  await persistCache(URL_CACHE_KEY, releaseUrlCache);
}

async function persistLatestReleaseCache() {
  await persistCache(LATEST_CACHE_KEY, latestReleaseCache);
}

async function persistCache(key, cacheMap) {
  const toStore = {};
  for (const [k, v] of cacheMap) {
    toStore[k] = v;
  }
  await chrome.storage.local.set({ [key]: toStore, [CACHE_TIME_KEY]: Date.now() });
}

async function fetchReleaseHtmlUrl(subjectUrl) {
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Notices-Manager-Chrome-Ext'
  };
  const resp = await fetch(subjectUrl, { headers });
  if (!resp.ok) throw new Error(t('detailsFailed', String(resp.status)));
  const data = await resp.json();
  return {
    html_url: data.html_url,
    prerelease: !!data.prerelease,
    tag_name: data.tag_name || '',
    name: data.name || ''
  };
}

// ===== Batch fetch details for selected releases =====
async function fetchAllReleaseDetails() {
  if (selectedSet.size === 0) return;

  const btn = $('fetchDetailsBtn');
  btn.disabled = true;

  const selected = allNotifications.filter(n => selectedSet.has(Number(n.id)));

  // 1. Fetch release detail for uncached selected notifications
  const uncached = selected.filter(n => !releaseUrlCache.has(n.subject.url));

  if (uncached.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(n => fetchReleaseHtmlUrl(n.subject.url))
      );
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          releaseUrlCache.set(batch[idx].subject.url, result.value);
        }
      });
      updateStatus(t('loadReleaseDetails', String(Math.min(i + batchSize, uncached.length)), String(uncached.length)));
    }
    await persistReleaseUrlCache();
  }

  // 2. Fetch latest release for each unique repo (uncached)
  const uniqueRepos = [...new Set(selected.map(n => n.repository.full_name))];
  const uncachedRepos = uniqueRepos.filter(r => !latestReleaseCache.has(r));

  if (uncachedRepos.length > 0) {
    const headers = {
      'Authorization': `token ${token}`,
      'User-Agent': 'GitHub-Notices-Manager-Chrome-Ext'
    };
    updateStatus(t('fetchingLatest', String(uncachedRepos.length)));
    const results = await Promise.allSettled(
      uncachedRepos.map(repo =>
        fetch(`${BASE_URL}/repos/${repo}/releases/latest`, { headers })
          .then(r => r.ok ? r.json() : null)
      )
    );
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const repo = uncachedRepos[idx];
        latestReleaseCache.set(repo, result.value.tag_name);
        freshLatestRepos.add(repo);
      }
    });
    await persistLatestReleaseCache();
  }

  btn.disabled = false;
  renderGrouped();
  updateMarkHiddenBtn();
  updateStatus(t('detailsFetched'));
}

// ===== Group and render =====
function getNotifInfo(notif) {
  const cached = releaseUrlCache.get(notif.subject.url);
  const repo = notif.repository.full_name;
  const latestTag = latestReleaseCache.get(repo);
  return {
    isLatest: cached && latestTag && cached.tag_name === latestTag,
    isPrerelease: cached && cached.prerelease,
  };
}

function renderGrouped() {
  let entries = [...groups.entries()].sort((a, b) => {
    const latestA = Math.max(...a[1].map(n => new Date(n.updated_at)));
    const latestB = Math.max(...b[1].map(n => new Date(n.updated_at)));
    return latestB - latestA;
  });

  // Filter: only show repos with multiple notifications
  if (filterMultiOnly) {
    entries = entries.filter(([, items]) => items.length > 1);
  }

  groupedList.innerHTML = '';

  let totalChecked = 0;
  const totalItems = allNotifications.length;

  for (const [repoFull, items] of entries) {
    const [owner, repo] = repoFull.split('/');
    const groupId = repoFull.replace(/[/.]/g, '-');
    const groupEl = document.createElement('div');
    groupEl.className = 'group';
    groupEl.dataset.repo = repoFull;

    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // Collapse when at least one notification has cached release details
    const hasDetailCache = items.some(n => releaseUrlCache.has(n.subject.url));
    const canCollapse = hasDetailCache;
    const isManuallyExpanded = expandedGroups.has(repoFull);

    let finalVisible = items;
    let hiddenItems = [];

    if (canCollapse && !isManuallyExpanded) {
      const latestItem = items.find(n => getNotifInfo(n).isLatest);
      const nonLatest = items.filter(n => n !== latestItem);
      const prereleases = nonLatest.filter(n => getNotifInfo(n).isPrerelease);

      const visible = [];
      if (latestItem) {
        visible.push(latestItem);
      } else {
        // No latest match — show most recent non-prerelease
        const releases = nonLatest.filter(n => !getNotifInfo(n).isPrerelease);
        if (releases.length > 0) visible.push(releases[0]);
      }
      // Only show prerelease if it's newer than the visible release
      if (prereleases.length > 0) {
        const lastRelease = visible[visible.length - 1];
        if (!lastRelease || new Date(prereleases[0].updated_at) > new Date(lastRelease.updated_at)) {
          visible.push(prereleases[0]);
        }
      }

      finalVisible = visible;
      hiddenItems = items.filter(n => !visible.includes(n));
    }

    // Check if all items in this group are selected
    const allGroupItems = groups.get(repoFull) || [];
    const groupAllChecked = allGroupItems.length > 0 && allGroupItems.every(n => selectedSet.has(Number(n.id)));
    totalChecked += allGroupItems.filter(n => selectedSet.has(Number(n.id))).length;

    const renderGroupItems = (list) => list.map(n => renderNotifItem(n, groupId)).join('');

    groupEl.innerHTML = `
      <div class="group-header" data-repo="${repoFull}">
        <div class="group-title">
          <label class="checkbox-label group-cb">
            <input type="checkbox" data-group-cb="${groupId}" class="custom-checkbox" ${groupAllChecked ? 'checked' : ''} />
            <span class="checkbox-ui"></span>
          </label>
          <a href="https://github.com/${repoFull}" target="_blank" class="group-repo-link">
            <span class="owner">${owner}</span>
            <span class="sep">/</span>
            <span class="repo">${repo}</span>
          </a>
        </div>
        <div class="group-header-actions">
          <span class="group-count">${items.length}</span>
          <button class="btn btn-sm group-mark-read" data-repo="${repoFull}">${t('markReadShort')}</button>
        </div>
      </div>
      <div class="group-items">
        ${renderGroupItems(finalVisible)}
        ${hiddenItems.length > 0 ? `
          <div class="group-hidden-items hidden">
            ${renderGroupItems(hiddenItems)}
          </div>
          <button class="group-expand-btn">${t('moreItems', String(hiddenItems.length))}</button>
        ` : ''}
      </div>
    `;

    groupedList.appendChild(groupEl);
  }

  selectAllCb.checked = totalChecked > 0 && totalChecked === totalItems;
}

// ===== Render a single notification item =====
function renderNotifItem(notif, groupId) {
  const cached = releaseUrlCache.get(notif.subject.url);
  // Use release's name from cache if available, fallback to notification title
  const displayTitle = cached && cached.name
    ? escapeHtml(cached.name)
    : escapeHtml(notif.subject.title);
  // Use cached html_url for hover preview, fallback to repo releases page
  const linkUrl = cached && cached.html_url
    ? cached.html_url
    : `${notif.repository.html_url}/releases`;
  const time = formatTime(notif.updated_at);

  const isPrerelease = cached && cached.prerelease;
  const tagName = cached && cached.tag_name ? escapeHtml(cached.tag_name) : '';
  const repo = notif.repository.full_name;
  const latestTag = latestReleaseCache.get(repo);
  const isLatest = latestTag && cached && cached.tag_name === latestTag;
  const isLatestFresh = isLatest && freshLatestRepos.has(repo);

  const isChecked = selectedSet.has(Number(notif.id));

  let badges = '';
  if (isLatest) {
    const cls = isLatestFresh ? 'latest-badge latest-fresh' : 'latest-badge';
    badges += `<span class="${cls}">${t('latest')}</span>`;
  }
  if (isPrerelease) badges += `<span class="prerelease-badge">${t('preRelease')}</span>`;
  if (tagName) badges += `<span class="notif-tag">${tagName}</span>`;

  return `
    <div class="notif-item" data-thread-id="${notif.id}">
      <label class="checkbox-label notif-cb">
        <input type="checkbox" data-notif-cb="${groupId}" class="custom-checkbox" ${isChecked ? 'checked' : ''} />
        <span class="checkbox-ui"></span>
      </label>
      <a href="${linkUrl}" target="_blank" class="notif-link"
         data-subject-url="${notif.subject.url}" title="${displayTitle}">
        <div class="notif-content">
          ${badges ? `<div class="notif-badges">${badges}</div>` : ''}
          <span class="notif-title">${displayTitle}</span>
          <span class="notif-time">${time}</span>
        </div>
      </a>
    </div>
  `;
}

// ===== Selection logic =====
function onSelectAllChange() {
  const checked = selectAllCb.checked;
  const allCbs = groupedList.querySelectorAll('input[data-notif-cb]');
  const groupCbs = groupedList.querySelectorAll('input[data-group-cb]');

  allCbs.forEach(cb => { cb.checked = checked; });
  groupCbs.forEach(cb => { cb.checked = checked; });

  selectedSet = checked
    ? new Set(allNotifications.map(n => Number(n.id)))
    : new Set();

  updateToolbarState();
}

function onSelectionChange(e) {
  const cb = e.target;

  // Individual notification checkbox
  if (cb.dataset.notifCb !== undefined) {
    const item = cb.closest('.notif-item');
    const id = Number(item.dataset.threadId);
    if (cb.checked) {
      selectedSet.add(id);
    } else {
      selectedSet.delete(id);
    }
    // Update group checkbox
    const groupEl = item.closest('.group');
    const groupCb = groupEl.querySelector('input[data-group-cb]');
    const groupItems = groupEl.querySelectorAll('input[data-notif-cb]');
    const groupChecked = [...groupItems].every(c => c.checked);
    groupCb.checked = groupChecked;
  }

  // Group checkbox
  if (cb.dataset.groupCb !== undefined) {
    const groupEl = cb.closest('.group');
    const groupItems = groupEl.querySelectorAll('input[data-notif-cb]');
    groupItems.forEach(c => { c.checked = cb.checked; });

    // Update selectedSet
    const repo = groupEl.dataset.repo;
    const notifs = groups.get(repo) || [];
    for (const n of notifs) {
      if (cb.checked) {
        selectedSet.add(Number(n.id));
      } else {
        selectedSet.delete(Number(n.id));
      }
    }
  }

  // Update select-all
  const allCbs = groupedList.querySelectorAll('input[data-notif-cb]');
  const allChecked = [...allCbs].every(c => c.checked);
  selectAllCb.checked = allChecked;

  updateToolbarState();
}

function updateToolbarState() {
  const count = selectedSet.size;
  selectedCount.textContent = t('selected', String(count));
  markReadBtn.disabled = count === 0;
  markReadBtn.textContent = t('markRead');
  fetchDetailsBtn.disabled = count === 0;
}

// ===== Lazy-resolve release URL on click =====
async function onNotifLinkClick(e) {
  const link = e.target.closest('a.notif-link');
  if (!link) return;

  const item = link.closest('.notif-item');
  const threadId = item ? Number(item.dataset.threadId) : null;
  const cached = releaseUrlCache.get(link.dataset.subjectUrl);

  // Cache hit → mark as read first, then open
  if (cached) {
    if (cached.html_url) {
      e.preventDefault();
      if (autoMarkRead && threadId) await markAutoRead(threadId);
      window.open(cached.html_url, '_blank');
    }
    return;
  }

  // Cache miss → lazy fetch, mark as read, then open
  e.preventDefault();
  const titleEl = link.querySelector('.notif-title');
  const origText = titleEl.textContent;
  titleEl.textContent = t('fetching');

  try {
    const info = await fetchReleaseHtmlUrl(link.dataset.subjectUrl);
    releaseUrlCache.set(link.dataset.subjectUrl, info);
    await persistReleaseUrlCache();
    titleEl.textContent = origText;
    if (autoMarkRead && threadId) await markAutoRead(threadId);
    window.open(info.html_url, '_blank');
  } catch {
    titleEl.textContent = origText;
    window.open(link.href, '_blank');
  }
}

async function markAutoRead(threadId) {
  try {
    await markThreadRead(threadId);
  } catch {
    // silent — auto mark is best-effort
  }
}

// ===== Group expand/collapse =====
function onGroupExpand(e) {
  const btn = e.target.closest('.group-expand-btn');
  if (!btn) return;

  const hiddenEl = btn.parentElement.querySelector('.group-hidden-items');
  if (!hiddenEl) return;

  const group = btn.closest('.group');
  const repo = group && group.dataset.repo;

  const isExpanded = !hiddenEl.classList.toggle('hidden');
  btn.textContent = isExpanded ? t('collapse') : t('moreItems', String(hiddenEl.children.length));

  if (repo) {
    if (isExpanded) {
      expandedGroups.add(repo);
    } else {
      expandedGroups.delete(repo);
    }
  }
  updateMarkHiddenBtn();
}

function onExpandAll() {
  const hiddenSections = groupedList.querySelectorAll('.group-hidden-items');
  const btns = groupedList.querySelectorAll('.group-expand-btn');
  const allExpanded = [...hiddenSections].every(el => !el.classList.contains('hidden'));

  hiddenSections.forEach(el => el.classList.toggle('hidden', allExpanded));
  btns.forEach(btn => {
    const hiddenEl = btn.parentElement.querySelector('.group-hidden-items');
    if (hiddenEl) {
      btn.textContent = allExpanded
        ? t('moreItems', String(hiddenEl.children.length))
        : t('collapse');
    }
  });
  expandAllBtn.textContent = allExpanded ? t('expandAll') : t('collapseAll');

  // Update expandedGroups state for all groups
  const allGroups = groupedList.querySelectorAll('.group');
  for (const g of allGroups) {
    const repo = g.dataset.repo;
    if (!repo) continue;
    const section = g.querySelector('.group-hidden-items');
    if (!section) continue;
    if (!section.classList.contains('hidden')) {
      expandedGroups.add(repo);
    } else {
      expandedGroups.delete(repo);
    }
  }
  updateMarkHiddenBtn();
}

// ===== Select all pre-release notifications =====
function onSelectPre() {
  selectedSet = new Set();
  for (const n of allNotifications) {
    const cached = releaseUrlCache.get(n.subject.url);
    if (cached && cached.prerelease) {
      selectedSet.add(Number(n.id));
    }
  }

  // Update all checkboxes in the DOM
  const allCheckboxes = groupedList.querySelectorAll('input[data-notif-cb]');
  for (const cb of allCheckboxes) {
    const item = cb.closest('.notif-item');
    const id = Number(item.dataset.threadId);
    cb.checked = selectedSet.has(id);
  }

  // Update group checkboxes
  for (const groupEl of groupedList.querySelectorAll('.group')) {
    const groupCb = groupEl.querySelector('input[data-group-cb]');
    const groupItems = groupEl.querySelectorAll('input[data-notif-cb]');
    groupCb.checked = [...groupItems].every(c => c.checked);
  }

  selectAllCb.checked = selectedSet.size === allNotifications.length;
  updateToolbarState();
}

// ===== Filter multi-repo toggle =====
function onFilterMulti() {
  filterMultiOnly = !filterMultiOnly;
  filterMultiBtn.textContent = filterMultiOnly ? t('filterMultiOn') : t('filterMulti');
  filterMultiBtn.classList.toggle('btn-active', filterMultiOnly);
  renderGrouped();
  updateMarkHiddenBtn();
}

// ===== Mark hidden items as read =====
function updateMarkHiddenBtn() {
  const hiddenSections = groupedList.querySelectorAll('.group-hidden-items.hidden');
  markHiddenBtn.disabled = hiddenSections.length === 0;
  markHiddenBtn.textContent = t('markHiddenRead');
}

async function onMarkHiddenRead() {
  markHiddenBtn.disabled = true;
  markHiddenBtn.textContent = t('marking');

  const hiddenItems = groupedList.querySelectorAll('.group-hidden-items.hidden .notif-item');
  const threadIds = [...hiddenItems].map(el => Number(el.dataset.threadId));
  if (threadIds.length === 0) {
    markHiddenBtn.textContent = t('markHiddenRead');
    return;
  }

  try {
    let marked = 0;
    const total = threadIds.length;
    for (const id of threadIds) {
      await markThreadRead(id);
      marked++;
      updateStatus(t('markingHidden', String(marked), String(total)));
    }
    await fetchAllNotifications();
    updateStatus(t('markedHidden', String(marked)));
  } catch (err) {
    showError(t('markFailed', err.message));
    markHiddenBtn.disabled = false;
    markHiddenBtn.textContent = t('markHiddenRead');
  }
}

// ===== Group mark-as-read =====
async function onGroupMarkRead(e) {
  const btn = e.target.closest('.group-mark-read');
  if (!btn) return;

  const repo = btn.dataset.repo;
  const notifs = groups.get(repo) || [];
  btn.disabled = true;
  btn.textContent = t('marking');

  try {
    let marked = 0;
    for (const n of notifs) {
      await markThreadRead(n.id);
      marked++;
      updateStatus(t('markingProgress', String(marked), String(notifs.length)));
    }
    await sleep(1000);
    await fetchAllNotifications();
    updateStatus(t('markedRepo', repo));
  } catch (err) {
    showError(t('markFailed', err.message));
    btn.disabled = false;
    btn.textContent = t('markReadShort');
  }
}

// ===== Mark as read =====
async function onMarkRead() {
  if (selectedSet.size === 0) return;

  markReadBtn.disabled = true;
  markReadBtn.textContent = t('marking');

  try {
    if (selectedSet.size === allNotifications.length) {
      await markAllRead();
      updateStatus(t('markedAllRead'));
      return;
    }

    const selectedByRepo = new Map();
    for (const n of allNotifications) {
      if (selectedSet.has(Number(n.id))) {
        const repo = n.repository.full_name;
        if (!selectedByRepo.has(repo)) selectedByRepo.set(repo, []);
        selectedByRepo.get(repo).push(n);
      }
    }

    let marked = 0;
    const total = selectedSet.size;

    for (const [, notifs] of selectedByRepo) {
      for (const n of notifs) {
        await markThreadRead(n.id);
        marked++;
      }
      updateStatus(t('markingProgress', String(marked), String(total)));
    }

    await sleep(2000);
    await fetchAllNotifications();
    updateStatus(t('markedRead', String(marked)));
  } catch (err) {
    showError(t('markFailed', err.message));
    markReadBtn.disabled = false;
    markReadBtn.textContent = t('markRead');
  }
}

async function markAllRead() {
  const resp = await fetch(`${BASE_URL}/notifications`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GitHub-Notices-Manager-Chrome-Ext'
    }
  });
  if (!resp.ok && resp.status !== 205) {
    throw new Error(t('markFailed', `all: ${resp.status}`));
  }
  await sleep(2000);
  await fetchAllNotifications();
}

async function markThreadRead(threadId) {
  const resp = await fetch(`${BASE_URL}/notifications/threads/${threadId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'GitHub-Notices-Manager-Chrome-Ext'
    }
  });
  if (!resp.ok && resp.status !== 205) {
    throw new Error(t('markFailed', `thread ${threadId}: ${resp.status}`));
  }
}

// ===== Helpers =====
const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return t('timeJustNow');
  if (diffMin < 60) return t('timeMinutesAgo', String(diffMin));
  if (diffHour < 24) return t('timeHoursAgo', String(diffHour));
  if (diffDay < 7) return t('timeDaysAgo', String(diffDay));

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ===== UI helpers =====
function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
}

function updateStatus(text) {
  statusText.textContent = text;
}
