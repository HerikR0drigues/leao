<template>
  <div class="app">
    <TopBar />
    <div class="layout" :class="{ 'with-inspector': showInspector }">
      <SideBar />
      <main class="main">
        <router-view :key="$route.fullPath" />
      </main>
      <InspectorPanel v-if="showInspector" />
    </div>
    <DialogHost />
    <ToastStack />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from './components/TopBar.vue';
import SideBar from './components/SideBar.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import DialogHost from './components/DialogHost.vue';
import ToastStack from './components/ToastStack.vue';

const route = useRoute();
const showInspector = computed(() => route.name === 'chat' || route.name === 'session');
</script>

<style scoped>
.app { height: 100%; display: flex; flex-direction: column; }
.layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 256px minmax(0, 1fr); }
.layout.with-inspector { grid-template-columns: 256px minmax(0, 1fr) 286px; }
.main { background: var(--bg); min-width: 0; min-height: 0; display: flex; }
.main > :deep(*) { flex: 1; min-width: 0; }
@media (max-width: 1200px) {
  .layout.with-inspector { grid-template-columns: 236px minmax(0, 1fr); }
  .layout.with-inspector > :deep(.inspector) { display: none; }
}
@media (max-width: 760px) {
  .layout, .layout.with-inspector { grid-template-columns: 1fr; }
  .layout > :deep(.sidebar) { display: none; }
}
</style>
