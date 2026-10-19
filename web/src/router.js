import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';
import ChatView from './views/ChatView.vue';
import SessionView from './views/SessionView.vue';
import DesignSystemView from './views/DesignSystemView.vue';

// Cada chat e cada sessão tem URL própria: F5, voltar e abrir em outra aba funcionam.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/chat/:id', name: 'chat', component: ChatView, props: true },
    { path: '/sessao/:id', name: 'session', component: SessionView, props: true },
    { path: '/design-system', name: 'design-system', component: DesignSystemView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
