# SmartRoute - Nền tảng web hỗ trợ dự đoán tình trạng giao thông và gợi ý lộ trình tối ưu

SmartRoute là một ứng dụng web bản đồ giao thông thông minh cho TP. Hồ Chí Minh, kết hợp khả năng tìm đường, phân tích rủi ro ùn tắc và gợi ý thời điểm xuất phát tối ưu.

## 🎯 Tính năng chính

### Bản đồ & Tìm kiếm
- **Bản đồ nền**: MapLibre GL với OpenStreetMap tiles, tự động fit về TP. Hồ Chí Minh
- **Viewport-based loading**: Chỉ tải road segments trong vùng đang xem để tối ưu hiệu năng
- **Tìm kiếm địa điểm**: Hỗ trợ geocoding qua Photon API hoặc nhập tọa độ trực tiếp
- **Traffic overlay**: Tô màu segments theo mức độ LOS (Level of Service A-F)

### Chỉ đường & Phân tích
- **Routing engine**: Tích hợp GraphHopper API để tính lộ trình
- **Route analysis**: Phân tích mức độ ùn tắc dọc theo tuyến đường
- **Departure recommendation**: Gợi ý thời điểm xuất phát tốt nhất (now, +15, +30, +60 phút)
- **Route metrics**: Hiển thị quãng đường, ETA, các bước chỉ đường và chỉ số rủi ro

### Dự đoán giao thông
- **Heuristic simulation**: Dự đoán LOS dựa trên giờ/ngày/cấp đường (PoC)
- **Time-based prediction**: Xem dự đoán theo các mốc thời gian khác nhau
- **Coverage tracking**: Hiển thị độ tin cậy của phân tích

## 🚀 Quick Start

### Yêu cầu
- Node.js 18+
- npm hoặc yarn

### Cài đặt

```bash
# Clone repository
git clone https://github.com/your-username/SmartRoute.git
cd SmartRoute

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local
```

### Cấu hình Environment Variables

```bash
# GraphHopper API Key (lấy từ https://www.graphhopper.com/)
GRAPHHOPPER_API_KEY=your_api_key_here
```

### Chạy development server

```bash
npm run dev
```

Mở http://localhost:3000 trên trình duyệt.

### Build cho production

```bash
npm run build
npm start
```

## 📁 Cấu trúc dự án

```
SmartRoute/
├── public/
│   └── data/                    # Dữ liệu road segments
│       ├── segments.csv         # Metadata road segments
│       └── nodes.csv            # Tọa độ các điểm giao lộ
├── src/
│   ├── app/
│   │   ├── page.tsx            # Trang chính
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Global styles
│   │   └── api/                # API routes
│   │       ├── segments-hcmc/  # Endpoint segments theo viewport
│   │       ├── route/          # Endpoint routing
│   │       └── route/
│   │           └── recommend-departure/  # Endpoint gợi ý giờ đi
│   ├── components/
│   │   ├── Map/                # Bản đồ MapLibre
│   │   ├── TrafficOverlay/     # Lớp hiển thị traffic
│   │   ├── SearchBox/          # Tìm kiếm địa điểm
│   │   ├── RouteLayer/         # Hiển thị tuyến đường
│   │   ├── RouteSummaryPanel/  # Panel thông tin route
│   │   └── TimePicker/         # Chọn mốc thời gian
│   └── lib/
│       ├── routing.ts          # Type definitions
│       ├── useTrafficSegments.ts  # Hook quản lý segments
│       ├── useRouteState.ts    # Hook quản lý route state
│       ├── useTrafficPredictionCache.ts  # Cache prediction
│       └── server/
│           ├── trafficData.ts         # Đọc CSV data
│           ├── graphhopper.ts         # GraphHopper integration
│           ├── routePredictionAnalysis.ts   # Phân tích traffic dọc route
│           └── departureRecommendation.ts  # Gợi ý giờ xuất phát
├── .env.example               # Environment variables template
├── next.config.js            # Next.js configuration
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## 🎨 Architecture Overview

```
┌─────────────────┐
│   Browser UI     │
│  (Next.js App)   │
└────────┬─────────┘
         │
    ┌────┴────┐
    │ API Routes│
    └────┬────┘
         │
    ┌────┴────────────────────┐
    │                         │
┌───▼────────┐        ┌──────▼──────┐
│  Local CSV │        │  External   │
│  Data      │        │  APIs       │
│            │        │             │
│ segments   │        │ GraphHopper │
│ nodes      │        │ Photon      │
└────────────┘        └─────────────┘
```

## 📊 Nguồn dữ liệu

Dữ liệu road segments được lấy từ **HCM Traffic Data 2025** (data.veronlabs.com):
- **Đơn vị cung cấp**: Sở Giao thông Vận tải TP. Hồ Chí Minh
- **Số lượng**: 33,441 quan sát giao thông, 10,027 road segments
- **Khoảng thời gian**: 2020-07-03 đến 2021-04-22
- **Độ phân giải**: 30 phút
- **Đầu ra**: Level of Service (LOS A-F)

Dataset này được sử dụng trong dự án research "Research Traffic AI" với mô hình XGBoost đạt 97.78% accuracy.

## 🔬 PoC Notes

Phiên bản hiện tại là **Proof of Concept** với một số đơn giản hóa:

| Chức năng | Ý tưởng ban đầu | PoC hiện tại |
|-----------|-----------------|--------------|
| AI Prediction | XGBoost model inference thật | Heuristic simulation |
| Backend | FastAPI riêng | Next.js API routes |
| Geocoding | Pelias self-hosted | Photon API public |
| Routing | Valhalla self-hosted | GraphHopper API |
| Bản đồ nền | Vector tiles tự host | Raster tiles OSM |
| Chatbot | LLM orchestration | Chưa triển khai |

## 🛠️ Tech Stack

- **Framework**: Next.js 15 với React 19
- **Language**: TypeScript
- **Map**: MapLibre GL JS 5
- **Routing**: GraphHopper API
- **Geocoding**: Photon API
- **Styling**: CSS Modules

## 📈 Tính năng đang phát triển

- [ ] Tích hợp model XGBoost inference thật
- [ ] Self-hosted geocoding với Pelias
- [ ] Self-hosted routing với Valhalla
- [ ] Vector tiles từ OSM data
- [ ] Chatbot LLM hỗ trợ tương tác
- [ ] Real-time traffic updates

## 🤝 Đóng góp

Contributions, issues và feature requests đều được chào đón!

## 📝 License

MIT License - xem file LICENSE để biết chi tiết.

## 🔗 Liên kết

- **Live Demo**: [coming soon]
- **API Docs**: [coming soon]
- **Technical Report**: xem file `latex/traffic_map_poc_technical_report.pdf`

---

**Đội ngũ phát triển**: Underrated - WebDev Adventure 2026
