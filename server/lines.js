// Leitura de arquivo grande linha a linha, em blocos de tamanho fixo e assíncrona: memória constante e
// o event loop livre entre blocos (um transcript de 653 MB levava 5 s travando o servidor).
const fs = require('fs');

const CHUNK_BYTES = 4 * 1024 * 1024;

// Lê de `start` até o fim chamando onLine para cada linha completa. Retorna { offset, rest }: offset é até
// onde leu e rest é a linha incompleta do final (o arquivo ainda está sendo escrito).
async function readLinesFrom(file, start, rest, onLine) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const buf = Buffer.alloc(Math.min(CHUNK_BYTES, Math.max(size - start, 1)));
    let offset = start;
    let pending = rest || '';
    while (offset < size) {
      const { bytesRead } = await handle.read(buf, 0, Math.min(buf.length, size - offset), offset);
      if (bytesRead <= 0) break;
      offset += bytesRead;
      const lines = (pending + buf.toString('utf8', 0, bytesRead)).split('\n');
      pending = lines.pop();
      for (const line of lines) if (line) onLine(line);
    }
    return { offset, rest: pending };
  } finally {
    await handle.close();
  }
}

module.exports = { readLinesFrom, CHUNK_BYTES };
