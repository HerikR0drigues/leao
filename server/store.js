// Persistência simples em ~/.leao: um JSON por chat + um de custo diário. Escrita atômica (.tmp + rename).
const fs = require('fs');
const path = require('path');
const config = require('./config');

const CHATS_DIR = path.join(config.DATA_DIR, 'chats');
const COST_FILE = path.join(config.DATA_DIR, 'cost.json');

function ensureDirs() {
  fs.mkdirSync(CHATS_DIR, { recursive: true });
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[store] ${file} ilegível: ${err.message}`);
    return fallback;
  }
}

function saveChat(chat) {
  ensureDirs();
  writeJsonAtomic(path.join(CHATS_DIR, `${chat.id}.json`), chat);
}

function loadChats() {
  ensureDirs();
  return fs.readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(CHATS_DIR, f), null))
    .filter(Boolean);
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addCost(usd) {
  ensureDirs();
  const data = readJson(COST_FILE, {});
  const key = todayKey();
  data[key] = Number(((data[key] || 0) + usd).toFixed(6));
  writeJsonAtomic(COST_FILE, data);
  return data[key];
}

function costToday() {
  return readJson(COST_FILE, {})[todayKey()] || 0;
}

const LIMITS_FILE = path.join(config.DATA_DIR, 'limits.json');

// Último retrato dos limites do plano: só é atualizado quando algum chat do app conversa.
function saveLimits(limits) {
  ensureDirs();
  writeJsonAtomic(LIMITS_FILE, limits);
}

function loadLimits() {
  return readJson(LIMITS_FILE, null);
}

module.exports = { saveChat, loadChats, addCost, costToday, todayKey, saveLimits, loadLimits };
