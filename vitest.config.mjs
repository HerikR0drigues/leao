import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Um processo só, sem paralelismo: a suíte é pequena e não pode pesar a máquina.
export default defineConfig({
  root: 'web',
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
