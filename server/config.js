const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const DATA_DIR = process.env.LEAO_DATA_DIR || path.join(HOME, '.leao');
// Dados da versão anterior (Claudão): movidos uma vez para o diretório novo, se ele ainda não existir.
const LEGACY_DATA_DIR = path.join(HOME, '.claudao');

function migrateLegacyData() {
  if (process.env.LEAO_DATA_DIR || fs.existsSync(DATA_DIR) || !fs.existsSync(LEGACY_DATA_DIR)) return;
  fs.renameSync(LEGACY_DATA_DIR, DATA_DIR);
  console.log(`[config] dados migrados de ${LEGACY_DATA_DIR} para ${DATA_DIR}`);
}

module.exports = {
  APP_NAME: 'Leão',
  HOST: '127.0.0.1',
  PORT: Number(process.env.LEAO_PORT || 4321),
  CLAUDE_BIN: process.env.LEAO_CLAUDE_BIN || 'claude',
  DATA_DIR,
  CLAUDE_HOME: path.join(HOME, '.claude'),
  CLAUDE_JSON: path.join(HOME, '.claude.json'),
  SESSIONS_POLL_MS: 3000,
  // Processo de chat parado por mais que isso é encerrado e volta com --resume (libera RAM).
  CHAT_IDLE_KILL_MS: 10 * 60 * 1000,
  MAX_MESSAGES_PER_CHAT: 500,
  TERMINAL_BIN: process.env.LEAO_TERMINAL || 'gnome-terminal',
  migrateLegacyData,
};
