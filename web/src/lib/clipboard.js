// Copia texto para a área de transferência. Retorna true/false em vez de lançar: quem chama mostra o aviso.
const WRITE_TIMEOUT_MS = 1000;

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      // Em aba sem foco o writeText pode ficar pendente: depois de 1 s tenta o método antigo.
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('área de transferência sem resposta')), WRITE_TIMEOUT_MS)),
      ]);
      return true;
    }
  } catch {
    /* cai no método antigo abaixo */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
