import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SelectMenu from './SelectMenu.vue';

const OPTIONS = [
  { value: 'haiku', label: 'haiku', description: 'rápido' },
  { value: 'sonnet', label: 'sonnet', description: 'equilíbrio' },
  { value: 'opus', label: 'opus', description: 'capaz' },
];
let wrapper;
afterEach(() => wrapper && wrapper.unmount());

describe('SelectMenu', () => {
  it('clique em qualquer parte do chip abre o menu com as descrições', async () => {
    wrapper = mount(SelectMenu, { props: { modelValue: 'haiku', options: OPTIONS, title: 'Modelo' }, attachTo: document.body });
    expect(wrapper.find('.popover').exists()).toBe(false);
    await wrapper.find('.trigger .value').trigger('click');
    expect(wrapper.find('.popover').exists()).toBe(true);
    expect(wrapper.findAll('.option')).toHaveLength(3);
    expect(wrapper.find('.option.selected .opt-label').text()).toBe('haiku');
    expect(wrapper.text()).toContain('equilíbrio');
  });

  it('escolher emite o valor e fecha', async () => {
    wrapper = mount(SelectMenu, { props: { modelValue: 'haiku', options: OPTIONS }, attachTo: document.body });
    await wrapper.find('.trigger').trigger('click');
    await wrapper.findAll('.option')[2].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['opus']]);
    expect(wrapper.find('.popover').exists()).toBe(false);
  });

  it('teclado: setas navegam, Esc fecha sem escolher', async () => {
    wrapper = mount(SelectMenu, { props: { modelValue: 'haiku', options: OPTIONS }, attachTo: document.body });
    await wrapper.find('.trigger').trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.find('.popover').exists()).toBe(true);
    await wrapper.find('.popover').trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.findAll('.option')[1].classes()).toContain('active');
    await wrapper.find('.popover').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.popover').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('clique fora fecha', async () => {
    wrapper = mount(SelectMenu, { props: { modelValue: 'haiku', options: OPTIONS }, attachTo: document.body });
    await wrapper.find('.trigger').trigger('click');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.popover').exists()).toBe(false);
  });
});
