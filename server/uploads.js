// Imagens anexadas no chat: gravadas em ~/.leao/uploads e enviadas ao Claude como bloco image base64.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const UPLOADS_DIR = path.join(config.DATA_DIR, 'uploads');
const MEDIA_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
// Limite da API para imagem em base64; acima disso o CLI recusa a mensagem.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 10;
const ID_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

function saveImages(images) {
  if (!images || !images.length) return [];
  if (!Array.isArray(images)) throw new Error('images deve ser uma lista');
  if (images.length > MAX_IMAGES) throw new Error(`no máximo ${MAX_IMAGES} imagens por mensagem (recebido: ${images.length})`);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return images.map((img, i) => {
    const ext = MEDIA_TYPES[img.mediaType];
    if (!ext) throw new Error(`imagem ${i + 1}: tipo "${img.mediaType}" não suportado (esperado: ${Object.keys(MEDIA_TYPES).join(', ')})`);
    const buf = Buffer.from(String(img.data || ''), 'base64');
    if (!buf.length) throw new Error(`imagem ${i + 1}: conteúdo vazio`);
    if (buf.length > MAX_IMAGE_BYTES) throw new Error(`imagem ${i + 1}: ${(buf.length / 1048576).toFixed(1)} MB (máximo 5 MB)`);
    const id = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, id), buf);
    return { id, mediaType: img.mediaType, name: String(img.name || id).slice(0, 120), data: buf.toString('base64') };
  });
}

// Conteúdo da mensagem para o stream-json: imagens primeiro, depois o texto.
function buildContent(text, saved) {
  if (!saved.length) return text;
  const blocks = saved.map((s) => ({ type: 'image', source: { type: 'base64', media_type: s.mediaType, data: s.data } }));
  if (text) blocks.push({ type: 'text', text });
  return blocks;
}

function uploadPath(id) {
  if (!ID_PATTERN.test(id)) throw Object.assign(new Error(`id de upload inválido: "${id}"`), { status: 404 });
  const file = path.join(UPLOADS_DIR, id);
  if (!fs.existsSync(file)) throw Object.assign(new Error(`upload não encontrado: "${id}"`), { status: 404 });
  return file;
}

module.exports = { saveImages, buildContent, uploadPath, MEDIA_TYPES };
