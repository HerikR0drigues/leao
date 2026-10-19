// Leitura em blocos de arquivo grande e validação de imagens anexadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.leao-test', `test-files-${process.pid}`);
process.env.LEAO_DATA_DIR = DIR;
fs.mkdirSync(DIR, { recursive: true });

const { readLinesFrom, CHUNK_BYTES } = require('../server/lines');
const { saveImages, buildContent } = require('../server/uploads');

test('linhas maiores que o bloco e linha incompleta no fim são tratadas certo', async () => {
  const file = path.join(DIR, 'grande.jsonl');
  const long = 'x'.repeat(CHUNK_BYTES + 10);
  fs.writeFileSync(file, `a\n${long}\nb\nincomple`);
  const lines = [];
  const first = await readLinesFrom(file, 0, '', (l) => lines.push(l));
  assert.deepEqual(lines.map((l) => (l.length > 20 ? `len${l.length}` : l)), ['a', `len${long.length}`, 'b']);
  assert.equal(first.rest, 'incomple');
  // O arquivo continua sendo escrito: a leitura seguinte completa a linha que estava pela metade.
  fs.appendFileSync(file, 'ta\nc\n');
  const more = [];
  await readLinesFrom(file, first.offset, first.rest, (l) => more.push(l));
  assert.deepEqual(more, ['incompleta', 'c']);
});

test('imagens: tipo, tamanho e quantidade validados com mensagem útil', () => {
  assert.throws(() => saveImages([{ mediaType: 'image/bmp', data: 'AA==' }]), /tipo "image\/bmp" não suportado/);
  assert.throws(() => saveImages([{ mediaType: 'image/png', data: '' }]), /conteúdo vazio/);
  const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  assert.throws(() => saveImages([{ mediaType: 'image/png', data: big }]), /máximo 5 MB/);
  assert.throws(() => saveImages(Array.from({ length: 11 }, () => ({ mediaType: 'image/png', data: 'AA==' }))), /no máximo 10 imagens/);
});

test('conteúdo enviado ao Claude: imagens primeiro, texto depois; sem imagem vai só o texto', () => {
  const saved = saveImages([{ name: 'a.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }]);
  const content = buildContent('descreva', saved);
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/png');
  assert.deepEqual(content[1], { type: 'text', text: 'descreva' });
  assert.equal(buildContent('só texto', []), 'só texto');
});
