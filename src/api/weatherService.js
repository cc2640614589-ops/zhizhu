import axios from 'axios';

// Open-Meteo 不需要各种 Key，直接调用即可
// 文档: https://open-meteo.com/en/docs

const weatherClient = axios.create({
    timeout: 10000
});

/**
 * 根据经纬度获取实时天气 (Open-Meteo)
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 */
export const getWeatherByLocation = async (lat, lng) => {
    try {
        // current_weather=true 获取当前天气
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&windspeed_unit=kmh&timezone=auto`;
        const res = await weatherClient.get(url);

        if (res.data && res.data.current_weather) {
            const cw = res.data.current_weather;
            return {
                temperature: cw.temperature,
                windPower: cw.windspeed,
                windDirection: cw.winddirection,
                weatherCode: cw.weathercode,
                weather: decodeWeatherCode(cw.weathercode),
                reportTime: cw.time
            };
        }
        return null;
    } catch (error) {
        console.error('Open-Meteo 获取失败:', error);
        throw error;
    }
};

const weatherCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 分钟缓存

/**
 * 批量获取实时天气 (Open-Meteo 支持经纬度数组)
 * @param {Array<{lat: number, lng: number, adcode: string}>} locations - 坐标列表
 */
export const getBatchWeather = async (locations) => {
    if (!locations || locations.length === 0) return [];

    const now = Date.now();
    const results = new Array(locations.length).fill(null);
    const pendingIndices = [];
    const pendingLocations = [];

    // 检查缓存
    locations.forEach((loc, index) => {
        const cacheKey = `${loc.lat},${loc.lng}`;
        const cached = weatherCache.get(cacheKey);
        if (cached && (now - cached.timestamp < CACHE_DURATION)) {
            results[index] = cached.data;
        } else {
            pendingIndices.push(index);
            pendingLocations.push(loc);
        }
    });

    if (pendingLocations.length === 0) return results;

    try {
        const lats = pendingLocations.map(l => l.lat).join(',');
        const lngs = pendingLocations.map(l => l.lng).join(',');

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current_weather=true&windspeed_unit=kmh&timezone=auto`;
        const res = await weatherClient.get(url);

        let freshData = [];
        if (Array.isArray(res.data)) {
            freshData = res.data.map(item => {
                const cw = item.current_weather;
                return {
                    temperature: cw.temperature,
                    windPower: cw.windspeed,
                    windDirection: cw.winddirection,
                    weatherCode: cw.weathercode,
                    weather: decodeWeatherCode(cw.weathercode),
                    reportTime: cw.time
                };
            });
        } else if (res.data && res.data.current_weather) {
            const cw = res.data.current_weather;
            freshData = [{
                temperature: cw.temperature,
                windPower: cw.windspeed,
                windDirection: cw.winddirection,
                weatherCode: cw.weathercode,
                weather: decodeWeatherCode(cw.weathercode),
                reportTime: cw.time
            }];
        }

        // 存入缓存并合并结果
        freshData.forEach((data, i) => {
            const targetIndex = pendingIndices[i];
            const loc = pendingLocations[i];
            const cacheKey = `${loc.lat},${loc.lng}`;

            weatherCache.set(cacheKey, {
                data,
                timestamp: now
            });
            results[targetIndex] = data;
        });

        return results;
    } catch (error) {
        console.error('Open-Meteo 批量获取失败:', error);
        return results; // 返回部分结果（含缓存的）
    }
};

/**
 * 简单的 WMO Weather Code 解码
 */
function decodeWeatherCode(code) {
    const map = {
        0: '晴 (Clear sky)',
        1: '主要晴 (Mainly clear)',
        2: '多云 (Partly cloudy)',
        3: '阴 (Overcast)',
        45: '雾 (Fog)',
        48: '沉积雾 (Rime fog)',
        51: '毛毛雨 (Drizzle)',
        53: '中度毛毛雨',
        55: '强毛毛雨',
        61: '小雨 (Rain slight)',
        63: '中雨 (Rain moderate)',
        65: '大雨 (Rain heavy)',
        71: '小雪 (Snow slight)',
        73: '中雪 (Snow moderate)',
        75: '大雪 (Snow heavy)',
        80: '阵雨 (Rain showers)',
        95: '雷雨 (Thunderstorm)'
    };
    return map[code] || '未知';
}

/**
 * 获取行政区划的 GeoJSON 以及尝试获取其子级
 * 注意：Open-Meteo 没有行政区划 API，我们这里主要依靠
 * 阿里云 DataV 的公开 GeoJSON 服务来获取“有哪些子区域”
 * url: https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json
 */
const geoCache = new Map();

export const getAreaGeoJson = async (adcode) => {
    if (geoCache.has(adcode)) {
        return geoCache.get(adcode);
    }

    try {
        const url = `/ali-geo/areas_v3/bound/${adcode}_full.json`;
        const res = await axios.get(url);
        geoCache.set(adcode, res.data);
        return res.data;
    } catch (e) {
        // 降级尝试不带 _full (只有轮廓没有子级)
        try {
            const urlSimple = `/ali-geo/areas_v3/bound/${adcode}.json`;
            const res = await axios.get(urlSimple);
            geoCache.set(adcode, res.data);
            return res.data;
        } catch (err2) {
            console.error('GeoJSON load failed', err2);
            return null;
        }
    }
};
