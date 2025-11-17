const APP_CONFIG = {
  hashtag: document.body.dataset.defaultHashtag || '#善念點亮台灣',
  commentPostId: document.body.dataset.defaultPostId || document.body.dataset.defaultPost || '',
};

const withCacheBust = (url) => `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
const DATA_URL_POSTS = '/api/hashtag/data?lang=zh-TW';
const DEFAULT_COMMENTS_ENDPOINT = '/api/comments/data';
const PAGE_SIZE = 48;
const CHANNEL_BASE = 'https://www.ganjingworld.com/channel';

const state = {
  datasets: {
    posts: { items: [], generatedAtMs: null },
    comments: { items: [], generatedAtMs: null },
  },
  activeDataset: 'posts',
  allItems: [],
  filteredItems: [],
  currentPage: 1,
  lastUpdated: null,
  generatedAtMs: null,
  lotterySelection: [],
};

const elements = {
  stats: document.getElementById('stats'),
  summary: document.getElementById('summary'),
  cardGrid: document.getElementById('cardGrid'),
  pagination: document.getElementById('pagination'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
  pageInfo: document.getElementById('pageInfo'),
  search: document.getElementById('search'),
  typeFilter: document.getElementById('typeFilter'),
  langFilter: document.getElementById('langFilter'),
  channelFilter: document.getElementById('channelFilter'),
  sortSelect: document.getElementById('sortSelect'),
  dateStartDate: document.getElementById('dateStartDate'),
  dateStartTime: document.getElementById('dateStartTime'),
  dateEndDate: document.getElementById('dateEndDate'),
  dateEndTime: document.getElementById('dateEndTime'),
  lastUpdated: document.getElementById('lastUpdated'),
  lotteryHint: document.getElementById('lotteryHint'),
  lotteryCount: document.getElementById('lotteryCount'),
  lotteryButton: document.getElementById('lotteryButton'),
  lotteryResults: document.getElementById('lotteryResults'),
  modeButtons: Array.from(document.querySelectorAll('.mode-button')),
  refreshButton: document.getElementById('refreshButton'),
  refreshStatus: document.getElementById('refreshStatus'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await activateDataset('posts');
    try {
      await loadDataset('comments');
    } catch (error) {
      console.info('留言資料尚未載入', error);
    }
    updateModeButtons();
    wireEvents();
  } catch (error) {
    console.error(error);
    elements.summary.textContent = '載入資料失敗，請稍後再試。';
  }
}

async function loadDataset(mode) {
  let url = '';
  if (mode === 'posts') {
    url = withCacheBust(DATA_URL_POSTS);
  } else if (mode === 'comments') {
    url = APP_CONFIG.commentPostId
      ? withCacheBust(`/api/posts/${APP_CONFIG.commentPostId}/comments`)
      : withCacheBust(DEFAULT_COMMENTS_ENDPOINT);
  }
  if (!url) {
    throw new Error('尚未設定留言來源');
  }
  const payload = await fetchJson(url);
  const parsed = mode === 'posts' ? parsePostsPayload(payload) : parseCommentsPayload(payload);
  state.datasets[mode] = parsed;
  return parsed;
}

async function activateDataset(mode) {
  if (!state.datasets[mode] || state.datasets[mode].items.length === 0) {
    try {
      await loadDataset(mode);
    } catch (error) {
      console.error(`載入 ${mode} 資料失敗`, error);
      if (mode === 'comments') {
        elements.summary.textContent = '留言資料尚未提供或載入失敗。';
      }
      return;
    }
  }

  const dataset = state.datasets[mode];
  state.activeDataset = mode;
  state.allItems = dataset.items.slice();
  state.filteredItems = [];
  state.currentPage = 1;
  state.generatedAtMs = dataset.generatedAtMs;
  state.lastUpdated = dataset.generatedAtMs ? new Date(dataset.generatedAtMs) : new Date();
  state.lotterySelection = [];

  updateModeButtons();
  populateFilters(state.allItems);
  updateDateInputs(state.allItems);
  setLotteryPlaceholder();
  applyFilters();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function parsePostsPayload(payload) {
  let items = [];
  let generatedAtMs = null;

  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === 'object') {
    items = Array.isArray(payload.items) ? payload.items : [];
    if (payload.generated_at_epoch) {
      generatedAtMs = Number(payload.generated_at_epoch) * 1000;
    } else if (payload.generated_at_iso) {
      const parsed = Date.parse(payload.generated_at_iso);
      if (!Number.isNaN(parsed)) generatedAtMs = parsed;
    }
  }

  const normalized = items.map((item) => {
    const owner = item.owner || {};
    const channelId = owner.id || item.channel_id || '';
    const channelName = owner.name || item.channel_name || item.sub_channel_name || '';
    let hashtagsArray = [];
    if (Array.isArray(item.hashtags)) {
      hashtagsArray = item.hashtags;
    } else if (typeof item.hashtags === 'string') {
      hashtagsArray = item.hashtags.split(';').map((tag) => tag.trim()).filter(Boolean);
    }
    return {
      ...item,
      channel_id: channelId,
      channel_name: channelName,
      channel_url: channelId ? `${CHANNEL_BASE}/${channelId}` : item.channel_url || '',
      createdAtMs: item.created_at_iso ? Date.parse(item.created_at_iso) : 0,
      hashtagsArray,
    };
  });
  return { items: normalized, generatedAtMs };
}

function parseCommentsPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { items: [], generatedAtMs: null };
  }
  let generatedAtMs = null;
  if (payload.generated_at_epoch) {
    generatedAtMs = Number(payload.generated_at_epoch) * 1000;
  } else if (payload.generated_at_iso) {
    const parsed = Date.parse(payload.generated_at_iso);
    if (!Number.isNaN(parsed)) generatedAtMs = parsed;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  const normalized = items.map((item) => ({
    ...item,
    channel_name: item.channel_name || item.author_name || '',
    channel_url: item.channel_url || (item.author_id ? `${CHANNEL_BASE}/${item.author_id}` : ''),
    createdAtMs: item.created_at_iso ? Date.parse(item.created_at_iso) : 0,
    content: item.content || '',
  }));
  return { items: normalized, generatedAtMs };
}

function updateModeButtons() {
  elements.modeButtons.forEach((button) => {
    const { mode } = button.dataset;
    const dataset = state.datasets[mode];
    const hasItems = dataset && dataset.items && dataset.items.length > 0;
    button.classList.toggle('is-active', mode === state.activeDataset);
    button.disabled = mode === 'comments' && !hasItems;
  });

  const isPostMode = state.activeDataset === 'posts';
  elements.typeFilter.disabled = !isPostMode;
  elements.langFilter.disabled = !isPostMode;
  elements.typeFilter.parentElement.classList.toggle('is-disabled', !isPostMode);
  elements.langFilter.parentElement.classList.toggle('is-disabled', !isPostMode);
}

function resetSelect(selectEl, label) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const option = document.createElement('option');
  option.value = 'all';
  option.textContent = label;
  selectEl.append(option);
}

function populateFilters(items) {
  resetSelect(elements.typeFilter, '全部類型');
  resetSelect(elements.langFilter, '全部語系');
  resetSelect(elements.channelFilter, '全部頻道');

  if (state.activeDataset === 'posts') {
    const typeSet = new Set();
    const langSet = new Set();
    const channelMap = new Map();

    items.forEach((item) => {
      if (item.type) typeSet.add(item.type);
      if (item.lang) langSet.add(item.lang);
      if (item.channel_name) {
        channelMap.set(item.channel_name, (channelMap.get(item.channel_name) || 0) + 1);
      }
    });

    appendOptions(elements.typeFilter, [...typeSet].sort());
    appendOptions(elements.langFilter, [...langSet].sort());

    const channelOptions = [...channelMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
    appendOptions(elements.channelFilter, channelOptions);
  } else {
    const authorSet = new Set(items.map((item) => item.channel_name).filter(Boolean));
    appendOptions(elements.channelFilter, [...authorSet].sort());
  }
}

function appendOptions(selectEl, values) {
  if (!selectEl) return;
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.append(option);
  });
}

function applyFilters() {
  const searchTerm = elements.search.value.trim().toLowerCase();
  const typeValue = elements.typeFilter.value;
  const langValue = elements.langFilter.value;
  const channelValue = elements.channelFilter.value;
  const startDate = elements.dateStartDate ? elements.dateStartDate.value : '';
  const startTime = elements.dateStartTime ? elements.dateStartTime.value : '';
  const endDate = elements.dateEndDate ? elements.dateEndDate.value : '';
  const endTime = elements.dateEndTime ? elements.dateEndTime.value : '';
  const isPostMode = state.activeDataset === 'posts';

  let startMs = null;
  if (startDate) {
    const startString = `${startDate} ${startTime || '00:00:00'}`;
    const parsed = Date.parse(startString.replace(' ', 'T'));
    if (!Number.isNaN(parsed)) startMs = parsed;
  }

  let endMs = null;
  if (endDate) {
    const endString = `${endDate} ${endTime || '23:59:59'}`;
    const parsed = Date.parse(endString.replace(' ', 'T'));
    if (!Number.isNaN(parsed)) endMs = parsed + 999;
  }

  const filtered = state.allItems.filter((item) => {
    if (isPostMode) {
      if (typeValue !== 'all' && item.type !== typeValue) return false;
      if (langValue !== 'all' && item.lang !== langValue) return false;
    }
    if (channelValue !== 'all' && (item.channel_name || '') !== channelValue) return false;
    if (startMs !== null && item.createdAtMs && item.createdAtMs < startMs) return false;
    if (endMs !== null && item.createdAtMs && item.createdAtMs > endMs) return false;

    if (searchTerm) {
      const haystack = isPostMode
        ? [item.title, item.owner_name, item.channel_name, Array.isArray(item.hashtagsArray) ? item.hashtagsArray.join(' ') : item.hashtags]
        : [item.channel_name, item.author_name, item.content];
      const text = haystack.filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(searchTerm)) return false;
    }
    return true;
  });

  state.filteredItems = filtered;
  render();
}

function render() {
  renderSummary();
  renderCards();
  renderPagination();
  updateLotteryControls();
  renderFooter();
}

function renderSummary() {
  const total = state.filteredItems.length;
  if (state.activeDataset === 'comments') {
    const uniqueAuthors = new Set(state.filteredItems.map((item) => item.channel_name).filter(Boolean)).size;
    elements.summary.textContent = `找到 ${total.toLocaleString()} 筆留言，來自 ${uniqueAuthors.toLocaleString()} 位使用者。`;
  } else {
    const uniqueChannels = new Set(state.filteredItems.map((item) => item.channel_name).filter(Boolean)).size;
    elements.summary.textContent = `找到 ${total.toLocaleString()} 筆內容，來自 ${uniqueChannels.toLocaleString()} 個頻道。`;
  }
}

function renderCards() {
  const grid = elements.cardGrid;
  grid.innerHTML = '';

  const total = state.filteredItems.length;
  if (total === 0) {
    const empty = document.createElement('p');
    empty.textContent = state.activeDataset === 'comments'
      ? '目前沒有符合條件的留言。'
      : '沒有符合條件的內容。';
    empty.className = 'empty-message';
    grid.append(empty);
    return;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = state.filteredItems.slice(start, end);

  pageItems.forEach((item) => {
    const card = state.activeDataset === 'comments' ? createCommentCard(item) : createPostCard(item);
    grid.append(card);
  });
}

function createPostCard(item) {
  const card = document.createElement('article');
  card.className = 'card';

  const cover = document.createElement('div');
  cover.className = 'card__cover';
  const img = document.createElement('img');
  img.alt = `${item.title || '內容'} 封面`;
  img.loading = 'lazy';
  img.src = item.poster_url || item.image_auto_url || 'https://via.placeholder.com/640x360?text=No+Image';
  cover.append(img);

  const badge = document.createElement('span');
  badge.className = 'card__badge';
  badge.textContent = item.type || 'Content';
  cover.append(badge);

  const body = document.createElement('div');
  body.className = 'card__body';

  const title = document.createElement('h2');
  title.className = 'card__title';
  title.textContent = item.title || '(無標題)';

  const meta = document.createElement('div');
  meta.className = 'card__meta';
  meta.innerHTML = `
    <span>📺 ${item.channel_name || item.owner_name || '未知頻道'}</span>
    <span>🕒 ${formatDate(item.createdAtMs)}</span>
    <span>👍 ${item.like_count?.toLocaleString?.() || 0}</span>
    <span>🔁 ${item.share_count?.toLocaleString?.() || 0}</span>
  `;

  const hashtags = document.createElement('div');
  hashtags.className = 'card__hashtags';
  if (item.hashtagsArray && item.hashtagsArray.length) {
    item.hashtagsArray.slice(0, 6).forEach((tag) => {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'badge';
      badgeEl.textContent = tag;
      hashtags.append(badgeEl);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'card__actions';
  if (item.post_url) {
    const link = document.createElement('a');
    link.href = item.post_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '前往原始內容';
    actions.append(link);
  }

  body.append(title, meta);
  if (hashtags.childElementCount) {
    body.append(hashtags);
  }
  body.append(actions);

  card.append(cover, body);
  return card;
}

function createCommentCard(item) {
  const card = document.createElement('article');
  card.className = 'card card--comment';

  const body = document.createElement('div');
  body.className = 'card__body';

  const title = document.createElement('h2');
  title.className = 'card__title';
  title.textContent = item.channel_name || item.author_name || '匿名使用者';

  const meta = document.createElement('div');
  meta.className = 'card__meta';
  meta.innerHTML = `
    <span>🕒 ${formatDate(item.createdAtMs)}</span>
    <span>👍 ${item.like_count?.toLocaleString?.() || 0}</span>
  `;

  const content = document.createElement('p');
  content.className = 'comment-content';
  content.textContent = item.content || '(無文字留言)';

  body.append(title, meta, content);

  if (item.sticker_url) {
    const stickerImg = document.createElement('img');
    stickerImg.src = item.sticker_url;
    stickerImg.loading = 'lazy';
    stickerImg.alt = '留言貼圖';
    stickerImg.className = 'comment-sticker';
    body.append(stickerImg);
  }

  const actions = document.createElement('div');
  actions.className = 'card__actions';
  if (item.channel_url) {
    const link = document.createElement('a');
    link.href = item.channel_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '查看使用者頻道';
    actions.append(link);
  }

  body.append(actions);
  card.append(body);
  return card;
}

function renderPagination() {
  const total = state.filteredItems.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (totalPages <= 1) {
    elements.pagination.hidden = true;
    return;
  }
  elements.pagination.hidden = false;
  elements.pageInfo.textContent = `第 ${state.currentPage} / ${totalPages} 頁`;
  elements.prevPage.disabled = state.currentPage === 1;
  elements.nextPage.disabled = state.currentPage === totalPages;
}

function updateLotteryControls() {
  const countInput = elements.lotteryCount;
  const button = elements.lotteryButton;
  const hint = elements.lotteryHint;
  if (!countInput || !button || !hint) return;

  const available = state.filteredItems.length;
  if (available === 0) {
    state.lotterySelection = [];
    hint.textContent = '目前沒有符合條件的資料可供抽籤。';
    countInput.value = '';
    countInput.disabled = true;
    button.disabled = true;
    setLotteryPlaceholder('目前沒有可抽的資料。');
    return;
  }

  countInput.disabled = false;
  button.disabled = false;
  const max = Math.max(1, available);
  countInput.max = String(max);
  if (!countInput.value || Number(countInput.value) < 1) {
    countInput.value = '1';
  } else if (Number(countInput.value) > max) {
    countInput.value = String(max);
  }
  hint.textContent = `目前共有 ${available.toLocaleString()} 筆符合條件的資料，可抽 1 至 ${max.toLocaleString()} 筆。`;

  if (state.lotterySelection.length) {
    const validIds = new Set(state.filteredItems.map((item) => item.id));
    const stillValid = state.lotterySelection.every((id) => validIds.has(id));
    if (!stillValid) {
      state.lotterySelection = [];
      setLotteryPlaceholder('篩選條件更新，請重新抽籤。');
    }
  }
}

function clampLotteryInput() {
  const countInput = elements.lotteryCount;
  if (!countInput) return 1;
  const available = state.filteredItems.length || 1;
  const max = Number(countInput.max || available) || available;
  let value = parseInt(countInput.value, 10);
  if (Number.isNaN(value) || value < 1) value = 1;
  if (value > max) value = max;
  countInput.value = String(value);
  return value;
}

function performLottery() {
  const available = state.filteredItems.length;
  if (available === 0) {
    setLotteryPlaceholder('目前沒有符合條件的資料可供抽籤。');
    return;
  }
  const count = Math.min(clampLotteryInput(), available);
  if (count <= 0) return;

  const pool = shuffleArray(state.filteredItems);
  const selected = pool.slice(0, count);
  renderLotteryResults(selected);
}

function renderLotteryResults(items) {
  const container = elements.lotteryResults;
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) {
    setLotteryPlaceholder();
    return;
  }
  state.lotterySelection = items.map((item) => item.id);
  items.forEach((item, index) => {
    const order = String(index + 1).padStart(2, '0');
    const card = state.activeDataset === 'comments' ? createCommentCard(item) : createPostCard(item);
    card.classList.add('card--lottery');
    const badge = document.createElement('span');
    badge.className = 'lottery-order';
    badge.textContent = `第 ${order} 抽`;
    const body = card.querySelector('.card__body');
    if (body) {
      body.insertBefore(badge, body.firstChild);
    } else {
      card.append(badge);
    }
    container.append(card);
  });
}

function setLotteryPlaceholder(message = '尚未抽籤。') {
  const container = elements.lotteryResults;
  if (!container) return;
  container.innerHTML = '';
  const note = document.createElement('p');
  note.className = 'lottery__empty';
  note.textContent = message;
  container.append(note);
}

function renderFooter() {
  if (!state.lastUpdated) return;
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  });
  elements.lastUpdated.textContent = formatter.format(state.lastUpdated);

  updateStats(state.filteredItems);
}

function updateDateInputs(items) {
  if (!elements.dateStartDate || !elements.dateStartTime || !elements.dateEndDate || !elements.dateEndTime || !items.length) return;
  const times = items
    .map((item) => item.createdAtMs)
    .filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (!times.length) return;
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const offset = min.getTimezoneOffset();
  const adjustToLocal = (date) => new Date(date.getTime() - offset * 60000);
  const minLocal = adjustToLocal(min);
  const maxLocal = adjustToLocal(max);
  const minDateStr = minLocal.toISOString().slice(0, 10);
  const maxDateStr = maxLocal.toISOString().slice(0, 10);

  elements.dateStartDate.min = minDateStr;
  elements.dateStartDate.max = maxDateStr;
  elements.dateEndDate.min = minDateStr;
  elements.dateEndDate.max = maxDateStr;
  elements.dateStartTime.min = '00:00:00';
  elements.dateStartTime.max = '23:59:59';
  elements.dateEndTime.min = '00:00:00';
  elements.dateEndTime.max = '23:59:59';

  if (!elements.dateStartDate.value) {
    elements.dateStartDate.value = minDateStr;
  }
  if (!elements.dateEndDate.value) {
    elements.dateEndDate.value = maxDateStr;
  }
  if (!elements.dateStartTime.value) {
    elements.dateStartTime.value = '00:00:00';
  }
  if (!elements.dateEndTime.value) {
    elements.dateEndTime.value = '23:59:59';
  }
}

function updateStats(items) {
  elements.stats.innerHTML = '';
  if (!items.length) return;

  let chips = [];
  if (state.activeDataset === 'comments') {
    const uniqueAuthors = new Set(items.map((item) => item.channel_name).filter(Boolean)).size;
    const stickerCount = items.filter((item) => item.sticker_url).length;
    chips = [
      `總留言數：${items.length.toLocaleString()}`,
      `留言使用者：${uniqueAuthors.toLocaleString()}`,
      `含貼圖：${stickerCount.toLocaleString()}`,
    ];
  } else {
    const uniqueChannels = new Set(items.map((item) => item.channel_name).filter(Boolean)).size;
    const langs = new Set(items.map((item) => item.lang).filter(Boolean)).size;
    chips = [
      `總內容數：${items.length.toLocaleString()}`,
      `頻道數：${uniqueChannels.toLocaleString()}`,
      `涵蓋語系：${langs}`,
    ];
  }

  chips.forEach((text) => {
    const chip = document.createElement('span');
    chip.className = 'stat-chip';
    chip.textContent = text;
    elements.stats.append(chip);
  });
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  });
  return formatter.format(timestamp);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function shuffleArray(source) {
  const array = source.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function wireEvents() {
  const triggerFilter = debounce(() => {
    state.currentPage = 1;
    applyFilters();
  }, 180);

  elements.search.addEventListener('input', triggerFilter);
  elements.typeFilter.addEventListener('change', () => {
    state.currentPage = 1;
    applyFilters();
  });
  elements.langFilter.addEventListener('change', () => {
    state.currentPage = 1;
    applyFilters();
  });
  elements.channelFilter.addEventListener('change', () => {
    state.currentPage = 1;
    applyFilters();
  });
  ['dateStartDate', 'dateStartTime', 'dateEndDate', 'dateEndTime'].forEach((key) => {
    const input = elements[key];
    if (input) {
      input.addEventListener('change', () => {
        state.currentPage = 1;
        applyFilters();
      });
    }
  });
  elements.sortSelect.addEventListener('change', () => {
    state.currentPage = 1;
    applyFilters();
  });

  elements.prevPage.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      render();
    }
  });

  elements.nextPage.addEventListener('click', () => {
    const totalPages = Math.ceil(state.filteredItems.length / PAGE_SIZE) || 1;
    if (state.currentPage < totalPages) {
      state.currentPage += 1;
      render();
    }
  });

  if (elements.lotteryButton) {
    elements.lotteryButton.addEventListener('click', performLottery);
  }

  elements.modeButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const { mode } = button.dataset;
      if (mode && mode !== state.activeDataset) {
        await activateDataset(mode);
      }
    });
  });

  if (elements.refreshButton) {
    elements.refreshButton.addEventListener('click', handleRefreshClick);
  }
}

async function handleRefreshClick() {
  const mode = state.activeDataset;
  if (mode === 'comments' && !APP_CONFIG.commentPostId) {
    setRefreshStatus('未設定留言貼文 ID，無法重新抓取');
    return;
  }
  try {
    setRefreshStatus('抓取中…', true);
    if (mode === 'posts') {
      await triggerHashtagFetch();
    } else {
      await triggerCommentFetch();
    }
    state.datasets[mode] = { items: [], generatedAtMs: null };
    await activateDataset(mode);
    setRefreshStatus('完成！');
  } catch (error) {
    console.error(error);
    setRefreshStatus(`錯誤：${error.message}`);
  }
}

function setRefreshStatus(message, isLoading = false) {
  if (elements.refreshStatus) {
    elements.refreshStatus.textContent = message;
  }
  if (elements.refreshButton) {
    elements.refreshButton.disabled = Boolean(isLoading);
  }
}

async function triggerHashtagFetch() {
  const response = await fetch('/api/hashtag/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashtag: APP_CONFIG.hashtag, lang: 'zh-TW', save_snapshot: true }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function triggerCommentFetch() {
  if (!APP_CONFIG.commentPostId) {
    throw new Error('未設定留言貼文 ID');
  }
  const response = await fetch(`/api/posts/${APP_CONFIG.commentPostId}/comments/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ save_snapshot: true }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
