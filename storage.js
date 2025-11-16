const DATA_FILE_NAME = 'ozon_price_tracker_data.json';
const DEFAULT_STATE = {
  items: [],
  refreshIntervalMinutes: 30,
};

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const supportsFileSystem = typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory;

async function readFromFile() {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(DATA_FILE_NAME, { create: true });
  const file = await handle.getFile();
  const text = await file.text();
  if (!text) {
    return clone(DEFAULT_STATE);
  }

  const parsed = JSON.parse(text);
  return normalizeState(parsed);
}

async function writeToFile(state) {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(DATA_FILE_NAME, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
  return state;
}

function normalizeState(candidate) {
  const normalized = {
    ...DEFAULT_STATE,
    ...(candidate || {}),
  };
  if (!Array.isArray(normalized.items)) {
    normalized.items = [];
  }
  normalized.items = normalized.items.map((item) => ({
    history: [],
    notified: false,
    ...item,
    history: Array.isArray(item.history)
      ? item.history
          .filter((entry) => typeof entry?.price === 'number' && entry.checkedAt)
          .map((entry) => ({
            price: entry.price,
            checkedAt: entry.checkedAt,
          }))
      : [],
  }));
  if (
    typeof normalized.refreshIntervalMinutes !== 'number' ||
    Number.isNaN(normalized.refreshIntervalMinutes)
  ) {
    normalized.refreshIntervalMinutes = DEFAULT_STATE.refreshIntervalMinutes;
  }
  return normalized;
}

export async function loadState() {
  try {
    if (supportsFileSystem) {
      return await readFromFile();
    }
    const stored = await chrome.storage.local.get('fileFallbackState');
    if (stored?.fileFallbackState) {
      return normalizeState(stored.fileFallbackState);
    }
  } catch (error) {
    console.warn('Не удалось прочитать состояние из файла, используется значение по умолчанию', error);
  }
  return clone(DEFAULT_STATE);
}

export async function saveState(state) {
  const normalized = normalizeState(state);
  try {
    if (supportsFileSystem) {
      await writeToFile(normalized);
    } else {
      await chrome.storage.local.set({ fileFallbackState: normalized });
    }
  } catch (error) {
    console.error('Не удалось записать состояние в файл', error);
    await chrome.storage.local.set({ fileFallbackState: normalized });
  }
  return normalized;
}

export function getDefaultState() {
  return clone(DEFAULT_STATE);
}
