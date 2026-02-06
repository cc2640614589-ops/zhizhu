<template>
  <span>{{ displayValue }}</span>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  value: {
    type: Number,
    required: true
  },
  duration: {
    type: Number,
    default: 800
  },
  suffix: {
    type: String,
    default: ''
  }
});

const displayValue = ref(props.value);

const easeOutQuad = (t) => t * (2 - t);

const animateValue = (start, end, duration) => {
  const startTime = Date.now();
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutQuad(progress);
    
    displayValue.value = Math.round(start + (end - start) * easedProgress);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  animate();
};

watch(() => props.value, (newVal, oldVal) => {
  animateValue(oldVal || 0, newVal, props.duration);
}, { immediate: true });
</script>
