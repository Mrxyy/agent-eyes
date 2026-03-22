<template>
  <section class="playbook panel">
    <div class="playbook-head">
      <h2>{{ title }}</h2>
      <span class="badge">{{ badge }}</span>
    </div>
    <p class="desc">
      {{ description }}
    </p>
    <ol class="steps">
      <li v-for="step in steps" :key="step">{{ step }}</li>
    </ol>
    <div class="chips">
      <span class="chip" v-for="item in chips" :key="item">{{ item }}</span>
    </div>
  </section>
</template>

<script>
export default {
  name: 'HelloWorld',
  props: {
    title: {
      type: String,
      default: 'Inspector Playbook',
    },
    badge: {
      type: String,
      default: 'Live Demo',
    },
    description: {
      type: String,
      default:
        'Follow these steps in order to present the full flow from element inspection to ACP suggestions.',
    },
    steps: {
      type: Array,
      default: () => [],
    },
    chips: {
      type: Array,
      default: () => ['Vue SFC', 'Pug', 'External Template', 'ACP Agent'],
    },
  },
};
</script>

<style scoped>
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px;
}

.playbook-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

h2 {
  margin: 0;
  color: #000;
}

.badge {
  border-radius: 999px;
  background: #0f766e;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
}

.desc {
  margin: 10px 0 12px;
  color: #16a34a;
  font-size: 13px;
}

.steps {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
}

.steps li {
  line-height: 1.4;
}

.chips {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  border: 1px solid #d1fae5;
  background: #ecfdf5;
  color: #065f46;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}
</style>
