// Leitura de /proc: RSS de um processo somado ao dos descendentes (MCPs, shells, servidores filhos).
const fs = require('fs');

function readProcTable() {
  const table = new Map();
  let entries;
  try {
    entries = fs.readdirSync('/proc');
  } catch {
    return table;
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    const row = readProcStatus(Number(name));
    if (row) table.set(row.pid, row);
  }
  return table;
}

function readProcStatus(pid) {
  let raw;
  try {
    raw = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
  } catch {
    return null;
  }
  return parseProcStatus(pid, raw);
}

function parseProcStatus(pid, raw) {
  const ppid = Number((raw.match(/^PPid:\s+(\d+)/m) || [])[1] || 0);
  const rssKb = Number((raw.match(/^VmRSS:\s+(\d+)\s+kB/m) || [])[1] || 0);
  return { pid, ppid, rssKb };
}

function treeRssKb(table, rootPid) {
  if (!table.has(rootPid)) return null;
  const children = new Map();
  for (const row of table.values()) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row.pid);
  }
  let total = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += (table.get(pid) || { rssKb: 0 }).rssKb;
    stack.push(...(children.get(pid) || []));
  }
  return total;
}

module.exports = { readProcTable, parseProcStatus, treeRssKb };
