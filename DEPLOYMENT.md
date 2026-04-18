# SmartRoute - Deployment Guide

## 📋 Prerequisites

- Node.js 18+ and npm/yarn
- Git

## 🚀 Local Development

```bash
# Clone or navigate to project
cd traffic-map-poc

# Install dependencies
npm install

# Run development server
npm run dev
```

Visit http://localhost:3000

## 🏗️ Build for Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

## 🌐 Deployment Options

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

### Static Export

For static hosting (Netlify, GitHub Pages):

```javascript
// next.config.js
module.exports = {
  output: 'export',
  images: { unoptimized: true },
};
```

```bash
npm run build
# Output will be in /out directory
```

## 🔧 Environment Variables

Create `.env.local`:

```env
# Optional: MapTiler API key for vector tiles
NEXT_PUBLIC_MAPTILER_KEY=your_key_here

# Optional: Custom API endpoint
NEXT_PUBLIC_TRAFFIC_API_URL=https://your-api.com/predict
```

## 📊 API Integration

### Connecting to Real Traffic Prediction API

1. Create prediction API endpoint:

```typescript
// src/app/api/predict/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { segments, timeHorizon } = await request.json();

  // Call your ML model API
  const response = await fetch('YOUR_MODEL_API_URL', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments, timeHorizon }),
  });

  const predictions = await response.json();
  return NextResponse.json(predictions);
}
```

2. Update TrafficOverlay component to use real API:

```typescript
const predictions = await fetch('/api/predict', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ segments, timeHorizon }),
}).then(r => r.json());
```

## 🔍 Performance Optimization

- Use CDN for map tiles
- Implement data caching
- Use Web Workers for heavy computations
- Enable gzip compression

## 📈 Monitoring

Consider adding:
- Google Analytics
- Sentry for error tracking
- Vercel Analytics (if using Vercel)

## 🆘 Troubleshooting

**Map not loading:**
- Check browser console for errors
- Verify map tiles URL is accessible
- Check CORS settings

**Segments not displaying:**
- Verify API is returning valid data
- Check browser network tab
- Ensure GeoJSON format is correct

**Performance issues:**
- Reduce segment count
- Implement data pagination
- Use data clustering
