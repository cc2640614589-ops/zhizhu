<template>
  <div class="weather-dashboard">
    <ParticleBackground />
    <header class="header">
      <div class="title-section">
        <h1>🌤️ 中国天气预报</h1>
        <p class="subtitle">数据来源：Open-Meteo API</p>
      </div>
      
      <div class="controls">
        <div class="input-group">
          <input 
            v-model="currentAdcode" 
            @keyup.enter="fetchData"
            placeholder="输入行政区划代码 (如 440000)"
            :disabled="loading"
          />
          <button @click="fetchData" :disabled="loading" class="search-btn">
            <span v-if="!loading">🔍 搜索</span>
            <span v-else>加载中...</span>
          </button>
        </div>
        
        <div class="shortcuts">
          <button 
            v-for="city in hotCities" 
            :key="city.code" 
            @click="setAdcode(city.code, city.name)"
            class="tag"
            :class="{ active: currentAdcode === city.code }"
          >
            {{ city.name }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="errorMsg" class="error-banner">
      ⚠️ {{ errorMsg }}
    </div>

    <!-- 加载进度条 -->
    <div v-if="loading && loadingProgress < 100" class="progress-container">
      <div class="progress-bar-wrapper">
        <div class="progress-fill" :style="{ width: `${loadingProgress}%` }"></div>
      </div>
      <div class="progress-text">正在同步气象数据... {{ loadingProgress }}%</div>
    </div>

    <div class="main-content">
      <!-- 左侧面板：天气信息 -->
      <aside class="info-panel">
        <!-- 骨架屏：加载中显示 -->
        <div v-if="loading && !currentWeather" class="weather-card skeleton">
          <div class="skeleton-header"></div>
          <div class="skeleton-temp"></div>
          <div class="skeleton-desc"></div>
          <div class="skeleton-details">
            <div class="skeleton-item"></div>
            <div class="skeleton-item"></div>
          </div>
        </div>

        <div v-else-if="currentWeather" class="weather-card cyberpunk-glow">
          <div class="location">
            <h2>{{ currentAreaName }}</h2>
            <span class="badge">已加载 {{ mapWeatherList.length }} 个区域</span>
          </div>
          
          <div class="current-temp">
            <AnimatedCounter :value="Math.round(currentWeather.temperature)" />°
          </div>
          
          <div class="weather-desc">
            {{ currentWeather.weather }}
          </div>
          
          <div class="weather-details">
            <div class="detail-item">
              <span class="icon">💨</span>
              <div>
                <div class="label">风速</div>
                <div class="value">{{ currentWeather.windPower }} km/h</div>
              </div>
            </div>
            
            <div class="detail-item">
              <span class="icon">🧭</span>
              <div>
                <div class="label">风向</div>
                <div class="value">{{ currentWeather.windDirection }}°</div>
              </div>
            </div>
          </div>
          
          <div class="update-time">
            更新时间：{{ formatTime(currentWeather.reportTime) }}
          </div>
        </div>
        
        <div v-else class="placeholder-card cyberpunk-glow">
          <div class="placeholder-icon">📍</div>
          <p>点击地图区域查看天气详情</p>
        </div>

        <div class="stats-card cyberpunk-glow">
          <h3>统计数据</h3>
          <div class="stat-row">
            <span>区域数量：</span>
            <strong>{{ mapWeatherList.length }}</strong>
          </div>
          <div class="stat-row">
            <span>平均温度：</span>
            <strong>{{ avgTemp }}°C</strong>
          </div>
          <div class="stat-row">
            <span>温度范围：</span>
            <strong>{{ tempRange }}</strong>
          </div>
        </div>
      </aside>
      
      <!-- Right Panel: Map -->
      <main class="map-section">
        <WeatherMap 
          :adcode="currentAdcode" 
          :weather-list="mapWeatherList"
          @map-click="handleMapClick"
        />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { getBatchWeather, getAreaGeoJson } from '@/api/weatherService';
import WeatherMap from '@/components/WeatherMap.vue';
import ParticleBackground from '@/components/ParticleBackground.vue';
import AnimatedCounter from '@/components/AnimatedCounter.vue';

const currentAdcode = ref('100000');
const currentAreaName = ref('中国');
const currentWeather = ref(null);
const mapWeatherList = ref([]);
const loading = ref(false);
const errorMsg = ref('');
const loadingProgress = ref(0); // 加载进度 (0-100)

let currentRequestId = 0; // 竞态控制 ID

const hotCities = [
  { name: '全国', code: '100000' },
  { name: '广东', code: '440000' },
  { name: '浙江', code: '330000' },
  { name: '北京', code: '110000' },
  { name: '上海', code: '310000' }
];

const avgTemp = computed(() => {
  if (mapWeatherList.value.length === 0) return '--';
  const sum = mapWeatherList.value.reduce((acc, item) => acc + (item.temperature || 0), 0);
  return Math.round(sum / mapWeatherList.value.length);
});

const tempRange = computed(() => {
  if (mapWeatherList.value.length === 0) return '--';
  const temps = mapWeatherList.value.map(item => item.temperature || 0);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  return `${Math.round(min)}° ~ ${Math.round(max)}°`;
});

const formatTime = (timeStr) => {
  if (!timeStr) return 'N/A';
  try {
    return new Date(timeStr).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return timeStr;
  }
};

const fetchData = async () => {
  if (!currentAdcode.value) return;
  
  const requestId = ++currentRequestId; // 每次发起请求递增 ID
  loading.value = true;
  errorMsg.value = '';
  mapWeatherList.value = [];
  loadingProgress.value = 0;
  
  try {
    const geoData = await getAreaGeoJson(currentAdcode.value);
    
    // 如果请求已过期（用户点击了新区域），立即退出
    if (requestId !== currentRequestId) return;

    if (!geoData || !geoData.features) {
      throw new Error('该区域暂无详细地理数据 (可能不支持钻取)');
    }

    if (geoData.name && (!currentAreaName.value || currentAreaName.value === '中国')) {
      currentAreaName.value = geoData.name;
    }

    const features = geoData.features;
    const locations = features.map(feature => {
      const props = feature.properties || {};
      let lat, lng;
      
      if (props.cp && Array.isArray(props.cp)) {
        [lng, lat] = props.cp;
      } else if (props.center && Array.isArray(props.center)) {
        [lng, lat] = props.center;
      } else if (props.centroid && Array.isArray(props.centroid)) {
        [lng, lat] = props.centroid;
      }
      
      return { name: props.name, adcode: props.adcode, lat, lng };
    }).filter(l => l.lat !== undefined && l.lng !== undefined);

    if (locations.length === 0) {
      currentWeather.value = null;
      errorMsg.value = '无法获取该区域的坐标信息';
      loadingProgress.value = 100;
      return;
    }

    const chunkSize = 5;
    const totalChunks = Math.ceil(locations.length / chunkSize);
    console.log(`正在为 ${locations.length} 个区域分片加载天气 (每组 ${chunkSize} 个)...`);

    for (let i = 0; i < locations.length; i += chunkSize) {
      // 检查每组请求前是否已被中断
      if (requestId !== currentRequestId) return;

      const chunk = locations.slice(i, i + chunkSize);
      const weatherData = await getBatchWeather(chunk);
      
      // 检查请求后是否已被中断
      if (requestId !== currentRequestId) return;

      const chunkResults = chunk.map((loc, index) => {
        const weather = weatherData[index];
        if (weather) {
          return { ...loc, ...weather };
        }
        return null;
      }).filter(r => r !== null);

      mapWeatherList.value = [...mapWeatherList.value, ...chunkResults];
      
      // 更新进度
      const processedCount = Math.min(i + chunkSize, locations.length);
      loadingProgress.value = Math.round((processedCount / locations.length) * 100);

      if (i === 0 && mapWeatherList.value.length > 0) {
        currentWeather.value = mapWeatherList.value[0];
      }
    }
    
    if (mapWeatherList.value.length === 0 && requestId === currentRequestId) {
      currentWeather.value = null;
      errorMsg.value = '获取天气数据失败';
    }

  } catch (error) {
    if (requestId === currentRequestId) {
      console.error('获取出错:', error);
      errorMsg.value = error.message || '加载数据失败';
    }
  } finally {
    if (requestId === currentRequestId) {
      loading.value = false;
    }
  }
};

const handleMapClick = (payload) => {
  if (payload.adcode) {
    currentAdcode.value = String(payload.adcode);
    currentAreaName.value = payload.name;
    fetchData();
  } else {
    errorMsg.value = '该区域没有下级行政区划';
    setTimeout(() => errorMsg.value = '', 3000);
  }
};

const setAdcode = (code, name) => {
  currentAdcode.value = code;
  currentAreaName.value = name;
  fetchData();
};

const prefetchGeoJson = async () => {
  console.log('正在预加载热点城市地理数据...');
  for (const city of hotCities) {
    if (city.code !== '100000') {
      getAreaGeoJson(city.code).catch(() => {});
    }
  }
};

onMounted(() => {
  fetchData();
  prefetchGeoJson(); // 启动预加载
});
</script>

<style scoped>
/* 原有基础样式保持... */
.weather-dashboard {
  min-height: 100vh;
  background: radial-gradient(circle at 50% 50%, #1a1f2c 0%, #0b0e14 100%);
  padding: 20px;
  position: relative;
  overflow: hidden;
  color: #e0e6ed;
}

/* 赛博朋克发光卡片 */
.cyberpunk-glow {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(0, 242, 255, 0.2) !important;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5), 
              inset 0 0 15px rgba(0, 242, 255, 0.05) !important;
}

.cyberpunk-glow::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(45deg, transparent, rgba(0, 242, 255, 0.1), transparent);
  z-index: -1;
  animation: border-glow 4s linear infinite;
}

@keyframes border-glow {
  0% { transform: translateX(-100%) translateY(-100%) rotate(0deg); }
  100% { transform: translateX(100%) translateY(100%) rotate(360deg); }
}

/* 骨架屏动画 */
.skeleton {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05) !important;
}

.skeleton div {
  background: linear-gradient(90deg, 
      rgba(255, 255, 255, 0.05) 25%, 
      rgba(255, 255, 255, 0.1) 50%, 
      rgba(255, 255, 255, 0.05) 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-header { height: 32px; width: 60%; margin-bottom: 30px; }
.skeleton-temp { height: 86px; width: 40%; margin-bottom: 20px; }
.skeleton-desc { height: 28px; width: 30%; margin-bottom: 40px; }
.skeleton-details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.skeleton-item { height: 60px; }

/* 标签呼吸灯 */
.tag.active {
  animation: tag-pulse 2s infinite;
}

@keyframes tag-pulse {
  0% { box-shadow: 0 0 5px rgba(0, 242, 255, 0.3); }
  50% { box-shadow: 0 0 20px rgba(0, 242, 255, 0.6); }
  100% { box-shadow: 0 0 5px rgba(0, 242, 255, 0.3); }
}

.header {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 30px;
  margin-bottom: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 10;
}

.title-section h1 {
  margin: 0 0 8px 0;
  font-size: 38px;
  font-weight: 800;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #00f2ff, #0072ff, #00f2ff);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: glow-text 3s linear infinite;
}

@keyframes glow-text {
  to { background-position: 200% center; }
}

.subtitle {
  margin: 0;
  color: #00f2ff;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 3px;
  opacity: 0.8;
}

.controls {
  margin-top: 25px;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  align-items: center;
}

.input-group {
  display: flex;
  gap: 12px;
}

.input-group input {
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(0, 242, 255, 0.3);
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  min-width: 250px;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.input-group input:focus {
  outline: none;
  border-color: #00f2ff;
  box-shadow: 0 0 20px rgba(0, 242, 255, 0.4);
  background: rgba(0, 0, 0, 0.5);
}

.search-btn {
  padding: 12px 28px;
  background: linear-gradient(135deg, #0072ff 0%, #00c6ff 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(0, 114, 255, 0.3);
}

.search-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 242, 255, 0.5);
  filter: brightness(1.1);
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.shortcuts {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tag {
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 30px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.4s;
  color: #adb5bd;
}

.tag:hover {
  border-color: #00f2ff;
  color: #00f2ff;
  background: rgba(0, 242, 255, 0.05);
  box-shadow: 0 0 15px rgba(0, 242, 255, 0.2);
}

.tag.active {
  background: rgba(0, 114, 255, 0.2);
  border-color: #00f2ff;
  color: #00f2ff;
  box-shadow: 0 0 20px rgba(0, 242, 255, 0.3);
}

.error-banner {
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.3);
  color: #ff4757;
  padding: 15px 25px;
  border-radius: 12px;
  margin-bottom: 25px;
  backdrop-filter: blur(5px);
  animation: shake 0.5s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.main-content {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 30px;
  position: relative;
  z-index: 10;
}

@media (max-width: 1200px) {
  .main-content {
    grid-template-columns: 1fr;
  }
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.weather-card,
.placeholder-card,
.stats-card {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 30px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s;
}

.weather-card:hover {
  transform: translateY(-5px);
  border-color: rgba(0, 242, 255, 0.2);
}

.location {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.location h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 10px rgba(0, 242, 255, 0.3);
}

.badge {
  background: rgba(0, 242, 255, 0.15);
  color: #00f2ff;
  border: 1px solid rgba(0, 242, 255, 0.3);
  padding: 6px 14px;
  border-radius: 30px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.current-temp {
  font-size: 86px;
  font-weight: 900;
  color: #fff;
  line-height: 1;
  margin-bottom: 12px;
  display: flex;
  align-items: flex-start;
}

.weather-desc {
  font-size: 22px;
  color: #00f2ff;
  margin-bottom: 35px;
  font-weight: 500;
}

.weather-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.detail-item {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  padding: 15px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.detail-item .icon {
  font-size: 28px;
  background: rgba(0, 242, 255, 0.1);
  padding: 10px;
  border-radius: 12px;
}

.detail-item .label {
  font-size: 11px;
  color: #6c757d;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.detail-item .value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.update-time {
  font-size: 11px;
  color: #6c757d;
  text-align: center;
  padding-top: 20px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}

.placeholder-card {
  text-align: center;
  padding: 60px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 20px;
  filter: drop-shadow(0 0 15px rgba(0, 242, 255, 0.2));
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 1; }
}

.placeholder-card p {
  color: #6c757d;
  margin: 0;
  font-size: 15px;
}

.stats-card h3 {
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-row:last-child {
  border-bottom: none;
}

.stat-row span {
  color: #abb2bf;
}

.stat-row strong {
  color: #00f2ff;
  font-family: 'Courier New', Courier, monospace;
}

.map-section {
  min-height: 600px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* 进度条样式 */
.progress-container {
  margin-bottom: 25px;
  background: rgba(255, 255, 255, 0.03);
  padding: 15px 20px;
  border-radius: 12px;
  border: 1px solid rgba(0, 242, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
  backdrop-filter: blur(10px);
}

.progress-bar-wrapper {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0072ff, #00f2ff);
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 10px rgba(0, 242, 255, 0.5);
}

.progress-text {
  font-size: 12px;
  color: #00f2ff;
  text-align: right;
  font-family: 'Courier New', Courier, monospace;
}
</style>
