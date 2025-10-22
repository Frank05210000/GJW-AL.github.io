const DATA_URL = `data/contents.json?v=${Date.now()}`;
const PAGE_SIZE = 48;

const state = {
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
  dateStart: document.getElementById('dateStart'),
  dateEnd: document.getElementById('dateEnd'),
  lastUpdated: document.getElementById('lastUpdated'),
  lotteryHint: document.getElementById('lotteryHint'),
  lotteryCount: document.getElementById('lotteryCount'),
  lotteryButton: document.getElementById('lotteryButton'),
  lotteryResults: document.getElementById('lotteryResults'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`讀取資料失敗：${response.status}`);
    }
    const payload = await response.json();
    let items = payload;
    let generatedAtMs = null;
    if (payload && !Array.isArray(payload) && Array.isArray(payload.items)) {
      items = payload.items;
      if (payload.generated_at_epoch) {
        generatedAtMs = payload.generated_at_epoch * 1000;
      } else if (payload.generated_at_iso) {
        const parsed = Date.parse(payload.generated_at_iso);
        if (!Number.isNaN(parsed)) generatedAtMs = parsed;
      }
    }

    state.allItems = items.map((item) => ({
      ...item,
      createdAtMs: item.created_at_iso ? Date.parse(item.created_at_iso) : 0,
      hashtagsArray: item.hashtags ? item.hashtags.split(';').filter(Boolean) : [],
    }));
    state.generatedAtMs = generatedAtMs;
    state.lastUpdated = generatedAtMs ? new Date(generatedAtMs) : new Date();

    populateFilters(state.allItems);
    updateStats(state.allItems);
    updateDateInputs(state.allItems);
    setLotteryPlaceholder();
    applyFilters();
    wireEvents();
  } catch (error) {
    console.error(error);
    elements.summary.textContent = '載入資料失敗，請確認 data/contents.json 是否存在。';
  }
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
  if (elements.dateStart) {
    elements.dateStart.addEventListener('change', () => {
      state.currentPage = 1;
      applyFilters();
    });
  }
  if (elements.dateEnd) {
    elements.dateEnd.addEventListener('change', () => {
      state.currentPage = 1;
      applyFilters();
    });
  }
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

  if (elements.lotteryCount) {
    const clamp = () => clampLotteryInput();
    elements.lotteryCount.addEventListener('input', clamp);
    elements.lotteryCount.addEventListener('change', clamp);
    elements.lotteryCount.addEventListener('blur', clamp);
  }

  if (elements.lotteryButton) {
    elements.lotteryButton.addEventListener('click', performLottery);
  }
}

function populateFilters(items) {
  const typeSet = new Set();
  const langSet = new Set();
  const channelMap = new Map();

  items.forEach((item) => {
    if (item.type) typeSet.add(item.type);
    if (item.lang) langSet.add(item.lang);
    if (item.channel_name) {
      const key = item.channel_name;
      channelMap.set(key, (channelMap.get(key) || 0) + 1);
    }
  });

  appendOptions(elements.typeFilter, [...typeSet].sort(), (value) => value);
  appendOptions(elements.langFilter, [...langSet].sort(), (value) => value);

  const channelOptions = [...channelMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  appendOptions(elements.channelFilter, channelOptions, (value) => value);
}

function appendOptions(selectEl, values, labelFn) {
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelFn(value);
    selectEl.append(option);
  });
}

function applyFilters() {
  const searchTerm = elements.search.value.trim().toLowerCase();
  const typeValue = elements.typeFilter.value;
  const langValue = elements.langFilter.value;
  const channelValue = elements.channelFilter.value;
  const startValue = elements.dateStart ? elements.dateStart.value : '';
  const endValue = elements.dateEnd ? elements.dateEnd.value : '';
  const startMs = startValue ? new Date(`${startValue}T00:00:00`).getTime() : null;
  const endMs = endValue ? new Date(`${endValue}T23:59:59.999`).getTime() : null;

  const filtered = state.allItems.filter((item) => {
    if (typeValue !== 'all' && item.type !== typeValue) return false;
    if (langValue !== 'all' && item.lang !== langValue) return false;
    if (channelValue !== 'all' && item.channel_name !== channelValue) return false;
    if (startMs && item.createdAtMs && item.createdAtMs < startMs) return false;
    if (endMs && item.createdAtMs && item.createdAtMs > endMs) return false;

    if (searchTerm) {
      const haystack = [
        item.title,
        item.owner_name,
        item.channel_name,
        item.hashtags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  const sortValue = elements.sortSelect.value;
  filtered.sort((a, b) => {
    switch (sortValue) {
      case 'oldest':
        return a.createdAtMs - b.createdAtMs;
      case 'likes':
        return (b.like_count || 0) - (a.like_count || 0);
      case 'shares':
        return (b.share_count || 0) - (a.share_count || 0);
      case 'newest':
      default:
        return b.createdAtMs - a.createdAtMs;
    }
  });

  state.filteredItems = filtered;
  render();
}

function render() {
  updateLotteryControls();
  renderSummary();
  renderCards();
  renderPagination();
  renderFooter();
}

function renderSummary() {
  const total = state.filteredItems.length;
  const uniqueChannels = new Set(state.filteredItems.map((item) => item.channel_name)).size;
  elements.summary.textContent = `找到 ${total.toLocaleString()} 筆內容，來自 ${uniqueChannels.toLocaleString()} 個頻道。`;
}

function renderCards() {
  const grid = elements.cardGrid;
  grid.innerHTML = '';

  const total = state.filteredItems.length;
  if (total === 0) {
    const empty = document.createElement('p');
    empty.textContent = '沒有符合條件的內容。請試著調整搜尋或篩選條件。';
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
    grid.append(createCard(item));
  });
}

function createCard(item) {
  const card = document.createElement('article');
  card.className = 'card';

  const cover = document.createElement('div');
  cover.className = 'card__cover';
  const img = document.createElement('img');
  img.alt = `${item.title || '內容'} 封面`;
  img.loading = 'lazy';
  img.src = item.poster_url || 'https://via.placeholder.com/640x360?text=No+Image';
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
    <span>📺 ${item.channel_name || '未知頻道'}</span>
    <span>🕒 ${formatDate(item.createdAtMs)}</span>
    <span>👍 ${item.like_count?.toLocaleString?.() || 0}</span>
    <span>🔁 ${item.share_count?.toLocaleString?.() || 0}</span>
  `;

  const hashtags = document.createElement('div');
  hashtags.className = 'card__hashtags';
  if (item.hashtagsArray.length) {
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
    hint.textContent = '目前沒有符合篩選的內容可供抽籤。';
    countInput.value = '';
    countInput.disabled = true;
    button.disabled = true;
    setLotteryPlaceholder('目前沒有符合篩選的內容可供抽籤。');
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
  hint.textContent = `目前共有 ${available.toLocaleString()} 筆符合篩選的內容，可抽 1 至 ${max.toLocaleString()} 筆。`;

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
  const button = elements.lotteryButton;
  const countInput = elements.lotteryCount;
  if (!button || !countInput) return;
  const available = state.filteredItems.length;
  if (available === 0) {
    setLotteryPlaceholder('目前沒有符合篩選的內容可供抽籤。');
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
    const card = createCard(item);
    card.classList.add('card--lottery');
    const orderChip = document.createElement('span');
    orderChip.className = 'lottery-order';
    const order = String(index + 1).padStart(2, '0');
    orderChip.textContent = `第 ${order} 抽`;
    const body = card.querySelector('.card__body');
    if (body) {
      body.insertBefore(orderChip, body.firstChild);
    } else {
      card.append(orderChip);
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

function shuffleArray(source) {
  const array = source.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function renderFooter() {
  if (!state.lastUpdated) return;
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  });
  elements.lastUpdated.textContent = formatter.format(state.lastUpdated);

  updateStats(state.allItems);
}

function updateDateInputs(items) {
  if (!elements.dateStart || !elements.dateEnd || !items.length) return;
  const times = items
    .map((item) => item.createdAtMs)
    .filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (!times.length) return;
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const formatInputDate = (date) => date.toISOString().slice(0, 10);
  const minStr = formatInputDate(min);
  const maxStr = formatInputDate(max);
  elements.dateStart.min = minStr;
  elements.dateStart.max = maxStr;
  elements.dateEnd.min = minStr;
  elements.dateEnd.max = maxStr;
  if (!elements.dateStart.value) {
    elements.dateStart.value = minStr;
  } else {
    if (elements.dateStart.value < minStr) elements.dateStart.value = minStr;
    if (elements.dateStart.value > maxStr) elements.dateStart.value = maxStr;
  }
  if (!elements.dateEnd.value) {
    elements.dateEnd.value = maxStr;
  } else {
    if (elements.dateEnd.value > maxStr) elements.dateEnd.value = maxStr;
    if (elements.dateEnd.value < minStr) elements.dateEnd.value = minStr;
  }
}

function updateStats(items) {
  const statChips = [
    `總內容數：${items.length.toLocaleString()}`,
    `頻道數：${new Set(items.map((item) => item.channel_name)).size.toLocaleString()}`,
    `涵蓋語系：${new Set(items.map((item) => item.lang).filter(Boolean)).size}`,
  ];
  elements.stats.innerHTML = '';
  statChips.forEach((text) => {
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
