# 高德天气 API Vue3 集成指南

本指南详细说明如何在 Vue 3 项目中集成高德地图天气 API，实现省份与县级行政区的天气数据可视化。

## 1. API 推荐与申请

### 推荐：高德地图 (AMap) Web 服务 API - 天气查询
我们选择高德 API，因为其免费额度高、覆盖全（支持省/市/区县）、文档清晰。

- **API服务地址**: `https://restapi.amap.com/v3/weather/weatherInfo`
- **支持级别**: 实时天气/预报天气
- **精度**: 省、市、区/县 (通过 `adcode` 控制)

### 申请步骤
1. 访问 [高德开放平台](https://lbs.amap.com/) 并注册账号。
2. 进入 **控制台** -> **应用管理** -> **我的应用**。
3. 点击 **创建新应用**（例如命名为“外卖天气气象”）。
4. 在应用下点击 **添加 Key**：
   - **服务平台** 选择 **Web服务** (注意：不是 Web 端 (JSAPI)，天气 API 属于 Web 服务接口)。
   - 同意协议并提交。
5. 获取 `Key` (您提供的 Key: `0b9116ea344c96cc4abe9f022a024348` 即属于此类)。

---

## 2. 接口调用 (前端实现)

代码文件位于: `src/api/weatherService.js`

### 核心逻辑
- 使用 `axios` 发起 GET 请求。
- 必填参数:
    - `key`: 您的 API Key。
    - `city`: 城市/区域的 `adcode` (例如 `110000` 北京, `440106` 天河区)。
    - `extensions`: `base` (实况) 或 `all` (预报)。
- **注意**: 纯前端调用可能会暴露 Key。生产环境建议通过后端代理转发，或在高德控制台设置 Key 的 IP 白名单/安全码。

---

## 3. 数据模型设计

代码文件位于: `src/model/weatherModel.json`

### 设计思路
为了在 ECharts 地图中实现钻取（Drill-down）或联动显示，建议采用**树形结构**：
- **根节点**: 省份 (Province)
- **子节点**: 市 (City) 或 区县 (County)
- **Data 字段**: 专门存放天气摘要，方便绑定到 UI 或 ECharts `tooltip`。

---

## 4. ECharts 地图绑定指南 (纯前端)

在 ECharts 中将 API 数据绑定到地图上，关键在于 **`adcode` 的匹配** 和 **`series.data` 的映射**。

### 步骤 A: 准备 GeoJSON
ECharts 渲染地图需要 GeoJSON 数据。
- 您可以从 [阿里云 DataV.GeoAtlas](http://datav.aliyun.com/portal/school/atlas/area_selector) 下载中国各省、市、县的 GeoJSON。
- 文件名通常即为 `adcode.json` (如 `100000.json` 为中国, `440000.json` 为广东)。

### 步骤 B: 数据预处理与绑定
ECharts 的 `series-map` 接收一个 `data` 数组，每个对象包含 `name` 和 `value` (以及其他自定义属性)。

```javascript
// 假设这是从 API 获取并处理好的天气列表
const apiWeatherList = [
  { adcode: '440100', name: '广州市', temp: 28, weather: '雷阵雨' },
  { adcode: '440300', name: '深圳市', temp: 29, weather: '晴' },
  // ...
];

// ECharts option 配置
const option = {
  tooltip: {
    trigger: 'item',
    formatter: function (params) {
      // params.data 就是我们绑定的自定义数据对象
      if (params.data) {
        return `${params.name}<br/>
                天气: ${params.data.weather}<br/>
                温度: ${params.data.temp}℃`;
      }
      return params.name;
    }
  },
  visualMap: {
    min: 0,
    max: 40,
    text: ['高温', '低温'],
    realtime: false,
    calculable: true,
    inRange: {
      color: ['lightskyblue', 'yellow', 'orangered']
    }
  },
  series: [
    {
      name: '广东天气',
      type: 'map',
      map: 'guangdong', // 需先注册 registerMap('guangdong', geoJson)
      label: { show: true },
      // 关键点：将数据通过 name 或 adcode 映射
      data: apiWeatherList.map(item => ({
        name: item.name,      // 必须匹配 GeoJSON 中的 properties.name
        value: item.temp,     // 用于 visualMap 颜色映射 (这里用温度)
        weather: item.weather // 自定义字段，供 tooltip 使用
      }))
    }
  ]
};
```

### 关键注意事项
1. **Adcode 一致性**: 高德 API 使用的 adcode 标准与阿里云 DataV 的 GeoJSON 大体一致，但极少数区域可能有变动。建议以 `name` 模糊匹配作为兜底，或维护一份映射表。
2. **异步加载**: GeoJSON 文件较大，建议在组件 `onMounted` 时异步 `import` 或 `fetch`，然后 `echarts.registerMap`。
3. **性能优化 (批量请求)**: 地图通常有数十个区块。如果每个县都发一个请求，会被限流。
    - **方案**: 展示省级地图时，只请求“主要城市”或仅展示省会天气。
    - **方案**: 真正进入“钻取”模式（点击某市进入县级地图）时，再通过 `Promise.all` 并发请求该市下属区县的天气。
