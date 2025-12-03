require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// API 地區代碼與 CWA 縣市名稱的對應表
// 這允許前端使用簡潔的代碼 (如 'kaohsiung') 來查詢後端
const LOCATION_MAP = {
  'kaohsiung': '高雄市',
  'taipei': '臺北市',
  'taichung': '臺中市',
  'miaoli': '苗栗縣', // 沿用您原程式碼中的苗栗縣
  // 可根據 CWA F-C0032-001 資料集的縣市名稱繼續擴充
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定地區的天氣預報
 * 呼叫 CWA「一般天氣預報-今明 36 小時天氣預報」資料集 (F-C0032-001)
 * @param {string} location - 地區代碼，例如 'kaohsiung'
 */
const getWeatherByLocation = async (req, res) => {
  // 從 URL 參數中取得地區代碼 (例如: 'kaohsiung')
  const locationCode = req.params.location;
  // 查找對應的 CWA 縣市名稱 (例如: '高雄市')
  const locationName = LOCATION_MAP[locationCode];

  // 1. 檢查地點是否合法或是否存在於對應表
  if (!locationName) {
    return res.status(400).json({
      error: "輸入地區代碼無效",
      message: `地區代碼 '${locationCode}' 尚未定義或不支援。`,
      supported_locations: Object.keys(LOCATION_MAP),
    });
  }

  try {
    // 2. 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 3. 呼叫 CWA API - 一般天氣預報（36小時），使用動態 locationName
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName, // 使用動態縣市名稱
        },
      }
    );

    // 4. 取得天氣資料
    const locationData = response.data.records.location[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${locationName} 的天氣資料`,
      });
    }

    // 5. 整理天氣資料 (與您原有的邏輯相同)
    const weatherData = {
      city: locationData.locationName,
      updateTime: response.data.records.datasetDescription,
      forecasts: [],
    };

    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
        windSpeed: "",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            // 確保有資料，若無則設為 0
            forecast.rain = (value ? value.parameterName : "0") + "%"; 
            break;
          case "MinT":
            forecast.minTemp = (value ? value.parameterName : "-") + "°C";
            break;
          case "MaxT":
            forecast.maxTemp = (value ? value.parameterName : "-") + "°C";
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
          case "WS":
            forecast.windSpeed = value.parameterName;
            break;
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      // CWA API 回應錯誤
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      dynamic_weather: "/api/weather/:location", // 新增動態路由說明
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得天氣預報：將固定路由改為動態路由
app.get("/api/weather/:location", getWeatherByLocation);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});