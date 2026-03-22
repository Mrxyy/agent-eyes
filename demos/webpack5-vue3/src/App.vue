<template>
  <div class="app-shell">
    <header class="hero">
      <div class="hero-left">
        <p class="eyebrow">{{ t.eyebrow }}</p>
        <h1>{{ t.heroTitle }}</h1>
        <p class="hero-subtitle">{{ t.heroSubtitle }}</p>
      </div>
      <div class="hero-right">
        <button class="btn btn-primary">{{ t.primaryAction }}</button>
        <button class="btn">{{ t.secondaryAction }}</button>
        <button class="btn btn-lang" @click="toggleLocale">{{ t.langToggle }}</button>
      </div>
    </header>

    <section class="stat-grid">
      <article class="stat-card">
        <p>{{ t.statLocatable }}</p>
        <strong class="stat-emphasis">{{ filteredTasks.length }}</strong>
      </article>
      <article class="stat-card">
        <p>{{ t.statPending }}</p>
        <strong>{{ pendingCount }}</strong>
      </article>
      <article class="stat-card">
        <p>{{ t.statDoneRate }}</p>
        <strong>86%</strong>
      </article>
      <article class="stat-card">
        <p>{{ t.statDuration }}</p>
        <strong>08:30</strong>
      </article>
    </section>

    <main class="content-grid">
      <section class="panel">
        <h2>{{ t.boardTitle }}</h2>
        <div class="toolbar">
          <input
            v-model="keyword"
            class="search"
            :placeholder="t.searchPlaceholder"
            type="text"
          />
          <label class="switch">
            <input v-model="onlyPending" type="checkbox" />
            <span>{{ t.onlyPending }}</span>
          </label>
        </div>

        <ul class="task-list">
          <li v-for="task in filteredTasks" :key="task.id" class="task-item">
            <div>
              <p class="task-title">{{ task.title[locale] }}</p>
              <p class="task-meta">{{ task.owner }} · {{ task.module }}</p>
            </div>
            <span class="tag" :class="task.status">
              {{ task.status === 'pending' ? t.statusPending : t.statusDone }}
            </span>
          </li>
        </ul>
      </section>

      <HelloWorld
        :title="t.playbookTitle"
        :badge="t.playbookBadge"
        :description="t.playbookDesc"
        :steps="t.steps"
        :chips="t.chips"
      />
    </main>

    <section class="panel template-panel">
      <h2>{{ t.templateTitle }}</h2>
      <p class="template-desc">{{ t.templateDesc }}</p>
      <div class="template-grid">
        <div class="template-card">
          <h3>{{ t.pugTitle }}</h3>
          <PugComponent />
        </div>
        <div class="template-card">
          <h3>{{ t.externalTitle }}</h3>
          <SrcTemp />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import HelloWorld from './components/HelloWorld.vue';
import PugComponent from './components/pug.vue';
import SrcTemp from './components/src-temp.vue';

const locale = ref('zh');
const keyword = ref('');
const onlyPending = ref(false);

const copy = {
  zh: {
    eyebrow: 'Code Inspector Demo',
    heroTitle: 'Webpack 5 + Vue 3 录屏演示页',
    heroSubtitle: '页面专门用于演示元素定位、多选上下文和 ACP 对话能力。',
    primaryAction: '创建需求',
    secondaryAction: '导出录屏脚本',
    langToggle: 'EN',
    statLocatable: '可定位元素',
    statPending: '待处理需求',
    statDoneRate: '本周完成率',
    statDuration: '录屏时长',
    boardTitle: '任务看板',
    searchPlaceholder: '搜索任务关键词',
    onlyPending: '仅看待处理',
    statusPending: '待处理',
    statusDone: '已完成',
    playbookTitle: 'Inspector 演示脚本',
    playbookBadge: '实时演示',
    playbookDesc: '建议按步骤录制，方便展示从定位到 AI 建议的完整流程。',
    steps: [
      '按住 Shift + Alt 进入定位模式',
      '点击元素打开面板并查看路径',
      'Shift/Ctrl + Click 累积多个选中项',
      '在对话框中输入需求并提交 ACP',
    ],
    chips: ['Vue SFC', 'Pug', '外部模板', 'ACP Agent'],
    templateTitle: '模板矩阵',
    templateDesc: '保留多种模板写法，便于演示跨模板元素定位能力。',
    pugTitle: 'Pug 模板',
    externalTitle: '外部 HTML 模板',
  },
  en: {
    eyebrow: 'Code Inspector Demo',
    heroTitle: 'Webpack 5 + Vue 3 Recording Showcase',
    heroSubtitle:
      'This page demonstrates element inspection, multi-selection context, and ACP chat flow.',
    primaryAction: 'Create Ticket',
    secondaryAction: 'Export Script',
    langToggle: '中文',
    statLocatable: 'Locatable Elements',
    statPending: 'Pending Tickets',
    statDoneRate: 'Weekly Completion',
    statDuration: 'Recording Duration',
    boardTitle: 'Task Board',
    searchPlaceholder: 'Search tasks',
    onlyPending: 'Pending only',
    statusPending: 'Pending',
    statusDone: 'Done',
    playbookTitle: 'Inspector Playbook',
    playbookBadge: 'Live Demo',
    playbookDesc:
      'Follow these steps in order to present the full flow from inspection to ACP suggestions.',
    steps: [
      'Hold Shift + Alt to enter inspect mode',
      'Click an element to open panel and inspect path',
      'Use Shift/Ctrl + Click to accumulate selections',
      'Write the request and submit to ACP',
    ],
    chips: ['Vue SFC', 'Pug', 'External Template', 'ACP Agent'],
    templateTitle: 'Template Matrix',
    templateDesc:
      'Multiple template styles are kept here to demonstrate cross-template inspection.',
    pugTitle: 'Pug Template',
    externalTitle: 'External HTML Template',
  },
};

const t = computed(() => copy[locale.value]);

const toggleLocale = () => {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
};

const tasks = ref([
  {
    id: 1,
    title: { zh: '优化筛选器交互', en: 'Improve filter interaction' },
    owner: 'Yuki',
    module: 'Dashboard',
    status: 'pending',
  },
  {
    id: 2,
    title: { zh: '修复按钮 hover 态', en: 'Fix button hover state' },
    owner: 'Ari',
    module: 'Design System',
    status: 'done',
  },
  {
    id: 3,
    title: { zh: '增强错误提示文案', en: 'Improve error copywriting' },
    owner: 'Max',
    module: 'Agent Panel',
    status: 'pending',
  },
  {
    id: 4,
    title: { zh: '增加深色模式预览', en: 'Add dark-mode preview' },
    owner: 'Ivy',
    module: 'Theme',
    status: 'done',
  },
  {
    id: 5,
    title: {
      zh: '重构多选上下文序列化',
      en: 'Refactor multi-selection serialization',
    },
    owner: 'Kai',
    module: 'Inspector Core',
    status: 'pending',
  },
]);

const filteredTasks = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return tasks.value.filter((task) => {
    const matchesKeyword =
      !text ||
      task.title[locale.value].toLowerCase().includes(text) ||
      task.module.toLowerCase().includes(text);
    const matchesPending = !onlyPending.value || task.status === 'pending';
    return matchesKeyword && matchesPending;
  });
});

const pendingCount = computed(
  () => tasks.value.filter((task) => task.status === 'pending').length
);
</script>

<style>
:root {
  --bg: #f5f7fb;
  --panel: #ffffff;
  --text: #1f2937;
  --muted: #6b7280;
  --line: #e5e7eb;
  --brand: #0f766e;
  --brand-soft: #dff7f3;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: radial-gradient(circle at 80% 0%, #daf3ff 0%, var(--bg) 45%);
  color: var(--text);
  font-family:
    'SF Pro Display',
    'PingFang SC',
    'Segoe UI',
    sans-serif;
}

#app {
  padding: 24px;
}

.app-shell {
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  gap: 18px;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  background: linear-gradient(120deg, #0f766e, #0f766e 55%, #0b4f49);
  color: #fff;
  border-radius: 16px;
  padding: 20px 22px;
}

.eyebrow {
  margin: 0 0 6px;
  opacity: 0.85;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.15;
}

.hero-subtitle {
  margin: 8px 0 0;
  opacity: 0.92;
}

.hero-right {
  display: flex;
  gap: 10px;
}

.btn {
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: transparent;
  color: #fff;
  border-radius: 10px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  border-color: transparent;
  background: #fef3c7;
  color: #7c2d12;
}

.btn-lang {
  border-color: rgba(255, 255, 255, 0.65);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
}

.stat-card p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.stat-card strong {
  margin-top: 8px;
  display: block;
  font-size: 28px;
  color: var(--brand);
}

.stat-emphasis {
  color: #ec4899;
}

.content-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 12px;
}

.content-grid h2 {
  color: #000;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
}

.panel h2 {
  margin: 0 0 12px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.search {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  height: 38px;
  padding: 0 10px;
}

.switch {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  color: var(--muted);
  font-size: 13px;
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}

.task-title {
  margin: 0;
  font-weight: 600;
}

.task-meta {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.tag {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}

.tag.pending {
  background: #fff4db;
  color: #b45309;
}

.tag.done {
  background: var(--brand-soft);
  color: #0f766e;
}

.template-panel {
  margin-bottom: 16px;
}

.template-desc {
  margin: 0 0 12px;
  color: var(--muted);
}

.template-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.template-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
}

.template-card h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--muted);
}

@media (max-width: 900px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .content-grid {
    grid-template-columns: 1fr;
  }
  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
