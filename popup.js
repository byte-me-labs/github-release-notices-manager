// ===== State =====
let allNotifications = [];
let releaseUrlCache = new Map();    // subject.url -> {html_url, prerelease, tag_name, name}
let latestReleaseCache = new Map(); // repo_full -> tag_name
let freshLatestRepos = new Set();   // repos with latest fetched this session
let groups = new Map();             // repo -> notification[]
let token = '';
const BASE_URL = 'https://api.github.com';
const BATCH_SIZE = 10;

function getHeaders() {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Notices-Manager-Chrome-Ext'
  };
}

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
const selectDropdownBtn = $('selectDropdownBtn');
const selectDropdownMenu = $('selectDropdownMenu');
const selectDropdownText = $('selectDropdownText');
const selectedCount = $('selectedCount');
const markReadBtn = $('markReadBtn');
const fetchDetailsBtn = $('fetchDetailsBtn');
const expandAllBtn = $('expandAllBtn');

const autoMarkReadCb = $('autoMarkReadCb');
const filterDropdownBtn = $('filterDropdownBtn');
const filterDropdownMenu = $('filterDropdownMenu');
const filterDropdownText = $('filterDropdownText');
const autoFetchDetailsCb = $('autoFetchDetailsCb');
const loadReadNotifsCb = $('loadReadNotifsCb');
const loadMoreBtn = $('loadMoreBtn');
const openTabModeSelect = $('openTabModeSelect');
let autoMarkRead = false;
let openTabMode = 'background';
let loadReadNotifs = false;
let loadMorePage = 1;           // current page for "load more"
let autoFetchDetails = false;
let filterMode = 'all'; // 'all' | 'multi' | 'pre_release'

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
  const result = await chrome.storage.local.get(['github_token', 'auto_mark_read', 'auto_fetch_details', 'load_read_notifs', 'open_tab_mode']);
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

  // Default to true
  if (result.auto_fetch_details === undefined) {
    await chrome.storage.local.set({ auto_fetch_details: true });
  }
  autoFetchDetails = result.auto_fetch_details !== false;
  autoFetchDetailsCb.checked = autoFetchDetails;
  fetchDetailsBtn.classList.toggle('hidden', autoFetchDetails);

  loadReadNotifs = result.load_read_notifs === true;
  loadReadNotifsCb.checked = loadReadNotifs;
  loadMoreBtn.classList.toggle('hidden', !loadReadNotifs);

  openTabMode = result.open_tab_mode || 'background';
  openTabModeSelect.value = openTabMode;

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
    loadMorePage = 1;
    if (token) fetchAllNotifications();
  });

  // Selection controls
  selectAllCb.addEventListener('change', onSelectAllChange);
  selectDropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSelectDropdown(); });
  selectDropdownMenu.addEventListener('click', onSelectOptionClick);
  document.addEventListener('click', closeSelectDropdown);
  expandAllBtn.addEventListener('click', onExpandAll);
  filterDropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFilterDropdown(); });
  filterDropdownMenu.addEventListener('click', onFilterOptionClick);
  document.addEventListener('click', closeFilterDropdown);

  fetchDetailsBtn.addEventListener('click', fetchAllReleaseDetails);

  // Mark as read
  markReadBtn.addEventListener('click', onMarkRead);

  // Auto mark as read
  autoMarkReadCb.addEventListener('change', async () => {
    autoMarkRead = autoMarkReadCb.checked;
    await chrome.storage.local.set({ auto_mark_read: autoMarkRead });
  });

  // Auto fetch details
  autoFetchDetailsCb.addEventListener('change', async () => {
    autoFetchDetails = autoFetchDetailsCb.checked;
    await chrome.storage.local.set({ auto_fetch_details: autoFetchDetails });
    fetchDetailsBtn.classList.toggle('hidden', autoFetchDetails);
  });

  // Load read notifications
  loadReadNotifsCb.addEventListener('change', async () => {
    loadReadNotifs = loadReadNotifsCb.checked;
    await chrome.storage.local.set({ load_read_notifs: loadReadNotifs });
    loadMoreBtn.classList.toggle('hidden', !loadReadNotifs);
    if (!loadReadNotifs) {
      loadMorePage = 1;
      if (token) fetchAllNotifications();
    }
  });

  // Open tab mode
  openTabModeSelect.addEventListener('change', async () => {
    openTabMode = openTabModeSelect.value;
    await chrome.storage.local.set({ open_tab_mode: openTabMode });
  });

  // Load more button
  loadMoreBtn.addEventListener('click', onLoadMore);
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
  $('notifSettingsLabel').textContent = t('notifSettings');
  $('autoMarkReadLabel').textContent = t('autoMarkRead');
  $('autoFetchDetailsLabel').textContent = t('autoFetchDetails');
  $('loadReadNotifsLabel').textContent = t('loadReadNotifs');
  $('openTabModeLabel').textContent = t('openTabMode');
  openTabModeSelect.options[0].text = t('openBackground');
  openTabModeSelect.options[1].text = t('openForeground');
  loadMoreBtn.textContent = t('loadMore');
  selectDropdownText.textContent = t('selectAction');
  updateSelectDropdownUI();
  expandAllBtn.textContent = t('expandAll');
  $('fetchDetailsBtn').textContent = t('fetchDetails');
  markReadBtn.textContent = t('markRead');
  $('loadingText').textContent = t('fetching');
  $('emptyText').textContent = t('noNotifs');
  // Update dropdown to reflect current filterMode
  updateFilterDropdownUI();
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

// ===== Load more (with read items) =====
async function onLoadMore() {
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = t('fetching');

  try {
    const url = `${BASE_URL}/notifications?per_page=50&all=true&page=${loadMorePage}&_=${Date.now()}`;
    const resp = await fetch(url, { headers: getHeaders() });

    if (!resp.ok) {
      if (resp.status === 401) throw new Error(t('tokenInvalid'));
      throw new Error(t('requestFailed', String(resp.status), resp.statusText));
    }

    const items = await resp.json();
    if (items.length === 0) {
      loadMoreBtn.textContent = t('loadMore');
      loadMoreBtn.disabled = true;
      updateStatus(t('noNotifs'));
      return;
    }

    // Detect last page before filtering (raw item count)
    const isLastPage = items.length < 50;

    // Filter to Release only
    const releaseOnly = items.filter(n => n.subject.type === 'Release');

    // Deduplicate against existing notifications
    const existingIds = new Set(allNotifications.map(n => String(n.id)));
    const newItems = releaseOnly.filter(n => !existingIds.has(String(n.id)));

    if (newItems.length > 0) {
      allNotifications.push(...newItems);
      buildGroupMap();
      if (autoFetchDetails) {
        const uncached = newItems.filter(n => !releaseUrlCache.has(n.subject.url));
        if (uncached.length > 0) {
          await autoFetchAllReleaseDetails(uncached);
        }
      }
      renderGrouped();
      updateToolbarState();
    }

    loadMorePage++;
    countBadge.textContent = allNotifications.length;
    updateStatus(t('totalNotifs', String(allNotifications.length)));
    loadMoreBtn.textContent = t('loadMore');
    loadMoreBtn.disabled = isLastPage;
  } catch (err) {
    showError(err.message);
    loadMoreBtn.textContent = t('loadMore');
    loadMoreBtn.disabled = false;
  }
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
  loadMorePage = 1;

  try {
    let url = `${BASE_URL}/notifications?per_page=50&_=${Date.now()}`;
    const allItems = [];

    while (url) {
      const resp = await fetch(url, { headers: getHeaders() });

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

    // Auto-fetch release details if enabled and there are uncached notifications
    if (autoFetchDetails) {
      const uncached = allNotifications.filter(n => !releaseUrlCache.has(n.subject.url));
      if (uncached.length > 0) {
        await autoFetchAllReleaseDetails(uncached);
      }
    }

    updateStatus(t('totalNotifs', String(allNotifications.length)));
    countBadge.textContent = allNotifications.length;
    countBadge.classList.remove('hidden');

    if (allNotifications.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      buildGroupMap();
      renderGrouped();
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
  const resp = await fetch(subjectUrl, { headers: getHeaders() });
  if (!resp.ok) throw new Error(t('detailsFailed', String(resp.status)));
  const data = await resp.json();
  return {
    html_url: data.html_url,
    prerelease: !!data.prerelease,
    tag_name: data.tag_name || '',
    name: data.name || ''
  };
}

// ===== Shared batch helpers =====
async function batchFetchReleaseDetails(notifications) {
  for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
    const batch = notifications.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(n => fetchReleaseHtmlUrl(n.subject.url))
    );
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        releaseUrlCache.set(batch[idx].subject.url, result.value);
      }
    });
    updateStatus(t('loadReleaseDetails', String(Math.min(i + BATCH_SIZE, notifications.length)), String(notifications.length)));
  }
  await persistReleaseUrlCache();
}

async function batchFetchLatestReleases(repos) {
  const uncached = repos.filter(r => !latestReleaseCache.has(r));
  if (uncached.length === 0) return;
  const results = await Promise.allSettled(
    uncached.map(repo =>
      fetch(`${BASE_URL}/repos/${repo}/releases/latest`, { headers: getHeaders() })
        .then(r => r.ok ? r.json() : null)
    )
  );
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value) {
      latestReleaseCache.set(uncached[idx], result.value.tag_name);
      freshLatestRepos.add(uncached[idx]);
    }
  });
  await persistLatestReleaseCache();
}

// ===== Auto-fetch all uncached release details (for filtering) =====
async function autoFetchAllReleaseDetails(notifications) {
  await batchFetchReleaseDetails(notifications);
  const uniqueRepos = [...new Set(notifications.map(n => n.repository.full_name))];
  await batchFetchLatestReleases(uniqueRepos);
}

// ===== Batch fetch details for selected releases =====
async function fetchAllReleaseDetails() {
  if (selectedSet.size === 0) return;

  const btn = $('fetchDetailsBtn');
  btn.disabled = true;

  const selected = allNotifications.filter(n => selectedSet.has(String(n.id)));
  const uncached = selected.filter(n => !releaseUrlCache.has(n.subject.url));

  if (uncached.length > 0) {
    await batchFetchReleaseDetails(uncached);
  }

  const uniqueRepos = [...new Set(selected.map(n => n.repository.full_name))];
  const uncachedRepos = uniqueRepos.filter(r => !latestReleaseCache.has(r));
  if (uncachedRepos.length > 0) {
    updateStatus(t('fetchingLatest', String(uncachedRepos.length)));
    await batchFetchLatestReleases(uniqueRepos);
  }

  btn.disabled = false;
  renderGrouped();
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

  // Filter by mode
  if (filterMode === 'multi') {
    entries = entries.filter(([, items]) => items.length > 1);
  } else if (filterMode === 'pre_release') {
    entries = entries.filter(([, items]) =>
      items.some(n => {
        const cached = releaseUrlCache.get(n.subject.url);
        return cached && cached.prerelease;
      })
    );
  }

  groupedList.innerHTML = '';

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
      const prereleases = nonLatest
        .filter(n => getNotifInfo(n).isPrerelease)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

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
    const groupAllChecked = allGroupItems.length > 0 && allGroupItems.every(n => selectedSet.has(String(n.id)));

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

  // Checkbox state: is every displayed notification selected?
  const displayedIds = new Set();
  for (const groupEl of groupedList.querySelectorAll('.group')) {
    const repo = groupEl.dataset.repo;
    for (const n of (groups.get(repo) || [])) {
      displayedIds.add(String(n.id));
    }
  }
  selectAllCb.checked = displayedIds.size > 0 && [...displayedIds].every(id => selectedSet.has(id));
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

  const isChecked = selectedSet.has(String(notif.id));

  let badges = '';
  if (isLatest) {
    const cls = isLatestFresh ? 'latest-badge latest-fresh' : 'latest-badge';
    badges += `<span class="${cls}">${t('latest')}</span>`;
  }
  if (isPrerelease) badges += `<span class="prerelease-badge">${t('preRelease')}</span>`;
  if (tagName) badges += `<span class="notif-tag">${tagName}</span>`;

  const isRead = notif.unread === false;
  const readClass = isRead ? ' notif-read' : '';

  return `
    <div class="notif-item${readClass}" data-thread-id="${notif.id}">
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

// ===== Shared: collect repos currently displayed =====
function getDisplayedRepos() {
  const repos = new Set();
  for (const groupEl of groupedList.querySelectorAll('.group')) {
    repos.add(groupEl.dataset.repo);
  }
  return repos;
}

// ===== Select all checkbox =====
function onSelectAllChange() {
  const checked = selectAllCb.checked;
  const displayedRepos = getDisplayedRepos();

  for (const n of allNotifications) {
    if (displayedRepos.has(n.repository.full_name)) {
      if (checked) {
        selectedSet.add(String(n.id));
      } else {
        selectedSet.delete(String(n.id));
      }
    }
  }
  syncCheckboxesFromSelection();
  updateToolbarState();
}

// ===== Select dropdown =====
function toggleSelectDropdown() {
  closeDropdown();
  const dropdown = selectDropdownBtn.parentElement;
  const isOpen = dropdown.classList.toggle('open');
  selectDropdownMenu.classList.toggle('hidden', !isOpen);
}

function onSelectOptionClick(e) {
  const option = e.target.closest('.select-option');
  if (!option) return;
  const action = option.dataset.action;
  closeSelectDropdownMenu();

  if (action === 'all') {
    selectAllVisible();
  } else if (action === 'pre_release') {
    selectPreRelease();
  } else if (action === 'collapsed') {
    selectCollapsed();
  }
}

function closeSelectDropdownMenu() {
  const dropdown = selectDropdownBtn.parentElement;
  dropdown.classList.remove('open');
  selectDropdownMenu.classList.add('hidden');
}

function closeSelectDropdown(e) {
  const dropdown = selectDropdownBtn.parentElement;
  if (!dropdown.classList.contains('open')) return;
  if (!dropdown.contains(e.target)) {
    closeSelectDropdownMenu();
  }
}

function updateSelectDropdownUI() {
  const optionLabels = {
    'all': t('selectAll'),
    'pre_release': t('selectPreRelease'),
    'collapsed': t('selectCollapsed')
  };
  const options = selectDropdownMenu.querySelectorAll('.select-option');
  options.forEach(opt => {
    opt.textContent = optionLabels[opt.dataset.action] || opt.dataset.action;
  });
}

function selectAllVisible() {
  const displayedRepos = getDisplayedRepos();
  selectedSet = new Set();
  for (const n of allNotifications) {
    if (displayedRepos.has(n.repository.full_name)) {
      selectedSet.add(String(n.id));
    }
  }
  syncCheckboxesFromSelection();
  updateToolbarState();
}

function selectPreRelease() {
  const displayedRepos = getDisplayedRepos();
  selectedSet = new Set();
  for (const n of allNotifications) {
    if (!displayedRepos.has(n.repository.full_name)) continue;
    const cached = releaseUrlCache.get(n.subject.url);
    if (cached && cached.prerelease) {
      selectedSet.add(String(n.id));
    }
  }
  syncCheckboxesFromSelection();
  updateToolbarState();
}

function selectCollapsed() {
  // Expand all collapsed sections first, so the user sees what's selected
  const hiddenSections = groupedList.querySelectorAll('.group-hidden-items.hidden');
  selectedSet = new Set();

  for (const section of hiddenSections) {
    // Expand this section
    section.classList.remove('hidden');
    const btn = section.parentElement.querySelector('.group-expand-btn');
    if (btn) {
      btn.textContent = t('collapse');
    }
    const group = section.closest('.group');
    if (group && group.dataset.repo) {
      expandedGroups.add(group.dataset.repo);
    }
    // Select all items in this formerly-collapsed section
    for (const el of section.querySelectorAll('.notif-item')) {
      selectedSet.add(el.dataset.threadId);
    }
  }

  syncCheckboxesFromSelection();
  updateToolbarState();
}

// Sync DOM checkboxes to match selectedSet
function syncCheckboxesFromSelection() {
  const allCheckboxes = groupedList.querySelectorAll('input[data-notif-cb]');
  for (const cb of allCheckboxes) {
    const item = cb.closest('.notif-item');
    const id = item.dataset.threadId;
    cb.checked = selectedSet.has(id);
  }
  // Update group checkboxes
  for (const groupEl of groupedList.querySelectorAll('.group')) {
    const groupCb = groupEl.querySelector('input[data-group-cb]');
    const groupItems = groupEl.querySelectorAll('input[data-notif-cb]');
    if (groupCb) {
      groupCb.checked = groupItems.length > 0 && [...groupItems].every(c => c.checked);
    }
  }
}

function onSelectionChange(e) {
  const cb = e.target;

  // Individual notification checkbox
  if (cb.dataset.notifCb !== undefined) {
    const item = cb.closest('.notif-item');
    const id = item.dataset.threadId;
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
        selectedSet.add(String(n.id));
      } else {
        selectedSet.delete(String(n.id));
      }
    }
  }

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
  const threadId = item ? item.dataset.threadId : null;
  const cached = releaseUrlCache.get(link.dataset.subjectUrl);

  e.preventDefault();

  // Open page immediately without waiting for API calls
  const openUrl = (cached && cached.html_url) ? cached.html_url : link.href;
  chrome.tabs.create({ url: openUrl, active: openTabMode === 'foreground' });

  // Background: mark as read
  if (autoMarkRead && threadId) markAutoRead(threadId);

  // Background: lazy fetch and cache details if missing
  if (!cached) {
    fetchReleaseHtmlUrl(link.dataset.subjectUrl)
      .then(info => {
        releaseUrlCache.set(link.dataset.subjectUrl, info);
        return persistReleaseUrlCache();
      })
      .catch(() => {});
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
}

// ===== Filter dropdown =====
function toggleFilterDropdown() {
  closeSelectDropdownMenu();
  const dropdown = filterDropdownBtn.parentElement;
  const isOpen = dropdown.classList.toggle('open');
  filterDropdownMenu.classList.toggle('hidden', !isOpen);
}

function onFilterOptionClick(e) {
  const option = e.target.closest('.filter-option');
  if (!option) return;
  const mode = option.dataset.mode;
  if (mode === filterMode) {
    closeDropdown();
    return;
  }
  filterMode = mode;
  selectedSet.clear();
  updateFilterDropdownUI();
  closeDropdown();
  renderGrouped();
  updateToolbarState();
}

function closeDropdown() {
  const dropdown = filterDropdownBtn.parentElement;
  dropdown.classList.remove('open');
  filterDropdownMenu.classList.add('hidden');
}

function closeFilterDropdown(e) {
  const dropdown = filterDropdownBtn.parentElement;
  if (!dropdown.classList.contains('open')) return;
  if (!dropdown.contains(e.target)) {
    closeDropdown();
  }
}

function updateFilterDropdownUI() {
  const modeLabels = {
    'all': t('filterAll'),
    'multi': t('filterMulti'),
    'pre_release': t('filterPreRelease')
  };
  filterDropdownText.textContent = modeLabels[filterMode] || t('filterAll');

  const options = filterDropdownMenu.querySelectorAll('.filter-option');
  options.forEach(opt => {
    opt.textContent = modeLabels[opt.dataset.mode] || opt.dataset.mode;
    opt.classList.toggle('active', opt.dataset.mode === filterMode);
  });
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
    await batchMarkThreadRead(notifs.map(n => n.id));
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
    const ids = [];
    for (const n of allNotifications) {
      if (selectedSet.has(String(n.id))) {
        ids.push(n.id);
      }
    }

    await batchMarkThreadRead(ids);
    await sleep(2000);
    await fetchAllNotifications();
    updateStatus(t('markedRead', String(ids.length)));
  } catch (err) {
    showError(t('markFailed', err.message));
    markReadBtn.disabled = false;
    markReadBtn.textContent = t('markRead');
  }
}

async function batchMarkThreadRead(ids) {
  let marked = 0;
  const total = ids.length;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(id => markThreadRead(id))
    );
    results.forEach(r => {
      if (r.status === 'fulfilled') marked++;
    });
    updateStatus(t('markingProgress', String(marked), String(total)));
  }
}

async function markThreadRead(threadId) {
  const resp = await fetch(`${BASE_URL}/notifications/threads/${threadId}`, {
    method: 'PATCH',
    headers: getHeaders()
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
