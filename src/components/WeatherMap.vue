<template>
  <div class="weather-map-wrapper">
    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <p>地图加载中...</p>
    </div>
    <div class="weather-map-container" ref="chartRef"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import axios from 'axios';

const props = defineProps({
  adcode: {
    type: [String, Number],
    required: true
  },
  weatherList: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['map-click']);

const chartRef = ref(null);
const loading = ref(false);
let chartInstance = null;
let currentGeoJson = null;
let currentCode = null;

const initChart = () => {
  if (chartRef.value && !chartInstance) {
    chartInstance = echarts.init(chartRef.value);
    window.addEventListener('resize', resizeHandler);
  }
};

const resizeHandler = () => {
  chartInstance?.resize();
};

const loadMap = async (code) => {
  if (!chartInstance) initChart();
  
  loading.value = true;
  chartInstance.showLoading({
    text: '加载中...',
    color: '#409eff',
    textColor: '#fff',
    maskColor: 'rgba(0, 0, 0, 0.4)'
  });

  try {
    const url = `https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`;
    const { data: geoJson } = await axios.get(url);
    
    echarts.registerMap(`map_${code}`, geoJson);
    currentGeoJson = geoJson;
    currentCode = code;
    
    renderMap();
  } catch (error) {
    console.warn('Failed to load _full.json, trying fallback:', error);
    try {
      const fallbackUrl = `https://geo.datav.aliyun.com/areas_v3/bound/${code}.json`;
      const { data: geoJson } = await axios.get(fallbackUrl);
      
      echarts.registerMap(`map_${code}`, geoJson);
      currentGeoJson = geoJson;
      currentCode = code;
      
      renderMap();
    } catch (e) {
      console.error('Map load failed completely:', e);
    }
  } finally {
    chartInstance.hideLoading();
    loading.value = false;
  }
};

const renderMap = () => {
  if (!chartInstance || !currentGeoJson || !currentCode) return;

  // Build map data by merging GeoJSON properties with weather data
  const mapData = currentGeoJson.features.map(feature => {
    const featureProps = feature.properties || {};
    
    // Find matching weather data from component's weatherList prop
    const weatherMatch = props.weatherList.find(w => 
      (w.adcode && featureProps.adcode && String(w.adcode) === String(featureProps.adcode)) ||
      (w.name && featureProps.name && (w.name === featureProps.name || w.name.includes(featureProps.name)))
    );

    return {
      name: featureProps.name,
      adcode: featureProps.adcode,
      cp: featureProps.cp, // [lng, lat]
      // Important: don't default to 0 if data is missing, use undefined or NaN
      // to avoid misinterpreting missing data as 0 degrees Celsius
      value: weatherMatch ? weatherMatch.temperature : undefined,
      temperature: weatherMatch?.temperature,
      weather: weatherMatch?.weather,
      windPower: weatherMatch?.windPower,
      ...weatherMatch
    };
  });

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#409eff',
      borderWidth: 1,
      textStyle: {
        color: '#fff'
      },
      formatter: (params) => {
        if (params.data) {
          const { name, adcode, weather, temperature, windPower } = params.data;
          return `
            <div style="padding: 5px;">
              <div style="font-weight: bold; margin-bottom: 5px;">${name}</div>
              ${adcode ? `<div style="font-size: 12px; color: #aaa;">代码: ${adcode}</div>` : ''}
              ${weather ? `<div>天气: ${weather}</div>` : ''}
              ${temperature !== undefined ? `<div>温度: ${temperature}°C</div>` : ''}
              ${windPower ? `<div>风速: ${windPower} km/h</div>` : ''}
            </div>
          `;
        }
        return params.name;
      }
    },
    visualMap: {
      left: 'right',
      top: 'center',
      min: -10,
      max: 40,
      inRange: {
        color: [
          '#003366', '#3366ff', '#00f2ff', '#00ffcc',
          '#ffff00', '#ff9900', '#ff3300', '#cc0000'
        ]
      },
      text: ['高温', '低温'],
      calculable: true,
      show: props.weatherList.length > 0,
      textStyle: {
        color: '#00f2ff'
      }
    },
    series: [
      {
        name: '天气',
        type: 'map',
        map: `map_${currentCode}`,
        roam: true,
        scaleLimit: {
          min: 1,
          max: 5
        },
        label: {
          show: true,
          color: '#fff',
          fontSize: 10,
          fontWeight: 'bold',
          formatter: (params) => {
            const data = params.data;
            if (data && data.temperature !== undefined) {
              return `{name|${params.name}}\n{temp|${Math.round(data.temperature)}°C} {icon|${getWeatherEmoji(data.weatherCode)}}`;
            }
            return `{name|${params.name}}`;
          },
          rich: {
            name: {
              color: '#00f2ff',
              fontSize: 11,
              fontWeight: 'bold',
              padding: [2, 0]
            },
            temp: {
              color: '#fff',
              fontSize: 10,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderRadius: 2,
              padding: [1, 4]
            },
            icon: {
              fontSize: 12
            }
          },
          textBorderColor: '#000',
          textBorderWidth: 2
        },
        itemStyle: {
          areaColor: 'rgba(11, 14, 20, 0.8)',
          borderColor: 'rgba(0, 242, 255, 0.3)',
          borderWidth: 1
        },
        emphasis: {
          label: {
            show: true,
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold'
          },
          itemStyle: {
            areaColor: 'rgba(0, 114, 255, 0.4)',
            borderColor: '#00f2ff',
            borderWidth: 2,
            shadowBlur: 20,
            shadowColor: 'rgba(0, 242, 255, 0.8)'
          }
        },
        select: {
          label: {
            show: true,
            color: '#fff'
          },
          itemStyle: {
            areaColor: 'rgba(0, 242, 255, 0.2)'
          }
        },
        data: mapData
      }
    ]
  };

  chartInstance.setOption(option, true);

  // Bind click event
  chartInstance.off('click');
  chartInstance.on('click', (params) => {
    if (params.data) {
      emit('map-click', {
        name: params.data.name,
        adcode: params.data.adcode,
        cp: params.data.cp
      });
    }
  });
};

// Watch for adcode changes
watch(() => props.adcode, (newCode) => {
  if (newCode && chartInstance) {
    loadMap(newCode);
  }
});

// Watch for weather data changes
watch(() => props.weatherList, () => {
  if (currentGeoJson && currentCode && chartInstance) {
    renderMap();
  }
}, { deep: true });

onMounted(async () => {
  // 确保 DOM 渲染后再初始化
  setTimeout(() => {
    initChart();
    if (props.adcode) {
      loadMap(props.adcode);
    }
  }, 100);
});

onUnmounted(() => {
  window.removeEventListener('resize', resizeHandler);
  chartInstance?.dispose();
});
const getWeatherEmoji = (code) => {
  const map = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌧️', 53: '🌧️', 55: '🌧️',
    61: '🌦️', 63: '🌧️', 65: '⛈️',
    71: '🌨️', 73: '🌨️', 75: '❄️',
    80: '🌦️', 95: '🌩️'
  };
  return map[code] || '🌡️';
};
</script>

<style scoped>
.weather-map-wrapper {
  position: relative;
  width: 100%;
  height: 600px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  overflow: hidden;
}

.weather-map-container {
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  color: #fff;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-overlay p {
  font-size: 14px;
  margin: 0;
}
</style>
