const { execFile } = require('child_process');

function run(bin, args, { cwd, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || stdout || '').toString().trim().slice(0, 500);
        reject(new Error(`${bin} ${args.join(' ')} falhou: ${err.message}${detail ? ` — ${detail}` : ''}`));
        return;
      }
      resolve(stdout.toString());
    });
  });
}

module.exports = { run };
