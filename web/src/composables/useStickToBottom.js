// Rola para o fim enquanto chegam mensagens, mas só se você já estava no fim: lendo algo acima, não puxa a tela.
// O elemento pode aparecer depois (a lista só existe quando o chat carrega), então liga/desliga quando ele muda.
import { onBeforeUnmount, ref, watch } from 'vue';

const NEAR_BOTTOM_PX = 120;

export function useStickToBottom(elRef) {
  const stuck = ref(true);
  let observer = null;
  let current = null;

  function onScroll() {
    if (current) stuck.value = current.scrollHeight - current.scrollTop - current.clientHeight < NEAR_BOTTOM_PX;
  }

  function scrollToBottom(force = false) {
    if (!current || (!force && !stuck.value)) return;
    current.scrollTop = current.scrollHeight;
    stuck.value = true;
  }

  function detach() {
    if (observer) observer.disconnect();
    if (current) current.removeEventListener('scroll', onScroll);
    observer = null;
    current = null;
  }

  watch(elRef, (el) => {
    detach();
    if (!el) return;
    current = el;
    el.addEventListener('scroll', onScroll, { passive: true });
    observer = new MutationObserver(() => scrollToBottom(false));
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    requestAnimationFrame(() => scrollToBottom(true));
  }, { flush: 'post', immediate: true });

  onBeforeUnmount(detach);

  return { stuck, scrollToBottom };
}
