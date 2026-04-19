'use client';

import React from 'react';
import {
  DepartureRecommendation,
  DepartureRecommendationOption,
  PickingMode,
  PredictionAnalysis,
  RouteData,
} from '@/lib/routing';

interface RouteSummaryPanelProps {
  route: RouteData | null;
  predictionAnalysis: PredictionAnalysis | null;
  departureRecommendation: DepartureRecommendation | null;
  recommendationLoading: boolean;
  routeError: string | null;
  pickingMode: PickingMode;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function formatDuration(durationSeconds: number) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) {
    return `${minutes} phút`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
}

function formatDelay(delaySeconds: number | undefined) {
  if (!delaySeconds || delaySeconds <= 0) {
    return '+0 phút';
  }

  return `+${Math.max(1, Math.round(delaySeconds / 60))} phút`;
}

function formatCongestionScore(score: number | undefined) {
  return score != null ? score.toFixed(2) : '0.00';
}

function formatRiskLevel(riskLevel: PredictionAnalysis['riskLevel']) {
  if (!riskLevel) return 'Không xác định';
  switch (riskLevel) {
    case 'low': return 'Thấp';
    case 'medium': return 'Trung bình';
    case 'high': return 'Cao';
    default: return riskLevel;
  }
}

function formatDepartureOffset(offset: DepartureRecommendationOption['departureOffsetMinutes']) {
  return offset === 0 ? 'Bây giờ' : `+${offset} phút`;
}

function getRiskBackground(riskLevel: PredictionAnalysis['riskLevel']) {
  switch (riskLevel) {
    case 'high':
      return '#fef2f2';
    case 'medium':
      return '#fff7ed';
    case 'low':
    default:
      return '#ecfdf5';
  }
}

function getRiskTextColor(riskLevel: PredictionAnalysis['riskLevel']) {
  switch (riskLevel) {
    case 'high':
      return '#b91c1c';
    case 'medium':
      return '#c2410c';
    case 'low':
    default:
      return '#047857';
  }
}

function getCoverageBackground(coverageLevel: 'low' | 'partial' | 'good') {
  switch (coverageLevel) {
    case 'low':
      return '#fef3c7';
    case 'partial':
      return '#f3e8ff';
    case 'good':
    default:
      return '#ecfdf5';
  }
}

function getCoverageTextColor(coverageLevel: 'low' | 'partial' | 'good') {
  switch (coverageLevel) {
    case 'low':
      return '#b45309';
    case 'partial':
      return '#7c3aed';
    case 'good':
    default:
      return '#047857';
  }
}

function getCoverageIcon(coverageLevel: 'low' | 'partial' | 'good'): string {
  switch (coverageLevel) {
    case 'low':
      return '!';
    case 'partial':
      return '~';
    case 'good':
    default:
      return '✓';
  }
}

export const RouteSummaryPanel: React.FC<RouteSummaryPanelProps> = ({
  route,
  predictionAnalysis,
  departureRecommendation,
  recommendationLoading,
  routeError,
  pickingMode,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        right: 10,
        bottom: 100,
        zIndex: 1200,
        width: 'min(320px, calc(100vw - 20px))',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        background: 'rgba(255, 255, 255, 0.96)',
        borderRadius: 16,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.16)',
        padding: 16,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Tóm tắt tuyến đường</div>

      {!route && !routeError && (
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginTop: 10 }}>
          {pickingMode
            ? `Nhấp vào bản đồ để chọn điểm ${pickingMode === 'origin' ? 'xuất phát' : 'đích đến'}.`
            : 'Chọn điểm xuất phát và điểm đến, sau đó yêu cầu tìm đường.'}
        </div>
      )}

      {routeError && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {routeError}
        </div>
      )}

      {route && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <div style={metricCardStyle}>
              <div style={metricLabelStyle}>Khoảng cách</div>
              <div style={metricValueStyle}>{formatDistance(route.distanceMeters)}</div>
            </div>
            <div style={metricCardStyle}>
              <div style={metricLabelStyle}>Thời gian dự kiến</div>
              <div style={metricValueStyle}>{formatDuration(route.durationSeconds)}</div>
            </div>
          </div>

          {predictionAnalysis && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 12,
                background: getRiskBackground(predictionAnalysis.riskLevel),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: getRiskTextColor(predictionAnalysis.riskLevel),
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Giao thông dự báo
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: getRiskTextColor(predictionAnalysis.riskLevel) }}>
                  {formatRiskLevel(predictionAnalysis.riskLevel)}
                </div>
              </div>

              {predictionAnalysis.coverage && predictionAnalysis.coverage.level !== 'good' && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: getCoverageBackground(predictionAnalysis.coverage.level),
                    fontSize: 11,
                    color: getCoverageTextColor(predictionAnalysis.coverage.level),
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{getCoverageIcon(predictionAnalysis.coverage.level)}</span>
                  <span>
                    Độ phủ dữ liệu: {predictionAnalysis.coverage.level === 'low' ? 'THẤP' : predictionAnalysis.coverage.level === 'partial' ? 'MỘT PHẦN' : 'TỐT'} ({predictionAnalysis.coverage.coverageRatio * 100}% tuyến đường được lấy mẫu)
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#475569' }}>Độ trễ dự kiến</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {formatDelay(predictionAnalysis.delaySeconds)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#475569' }}>Điểm tắc nghẽn</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {formatCongestionScore(predictionAnalysis.congestionScore)}
                  </div>
                </div>
              </div>
              {predictionAnalysis.summary && (
                <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, marginTop: 10 }}>
                  {predictionAnalysis.summary}
                </div>
              )}
              {!!predictionAnalysis.congestedSegments?.length && (
                <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, marginTop: 10, fontWeight: 600 }}>
                  {predictionAnalysis.congestedSegments.length} đoạn đường kẹt xe được đánh dấu trên bản đồ.
                </div>
              )}
            </div>
          )}

          {(recommendationLoading || departureRecommendation) && (
            <div style={recommendationCardStyle}>
              <div>
                <div style={recommendationLabelStyle}>Thời gian xuất phát tốt nhất</div>
                {departureRecommendation && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                    Khuyến nghị: {formatDepartureOffset(departureRecommendation.recommendedDepartureOffsetMinutes)}
                  </div>
                )}
              </div>

              {recommendationLoading && !departureRecommendation && (
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginTop: 10 }}>
                  Đang đánh giá các lựa chọn xuất phát bây giờ, +15, +30 và +60 phút...
                </div>
              )}

              {departureRecommendation && (
                <>
                  <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, marginTop: 10 }}>
                    {departureRecommendation.summary}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {departureRecommendation.options.map((option) => (
                      <div
                        key={option.departureOffsetMinutes}
                        style={{
                          ...optionRowStyle,
                          borderColor: option.recommended ? '#c4b5fd' : '#e2e8f0',
                          background: option.recommended ? '#faf5ff' : '#fff',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                              {formatDepartureOffset(option.departureOffsetMinutes)}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                              Dự kiến {formatDuration(option.predictedDurationSeconds)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <div style={inlineChipStyle}>Rủi ro {formatRiskLevel(option.riskLevel)}</div>
                            {option.coverageLevel && option.coverageLevel !== 'good' && (
                              <div style={{ ...inlineChipStyle, color: '#7c3aed', borderColor: '#ddd6fe', background: '#faf5ff' }}>
                                Độ phủ {option.coverageLevel === 'low' ? 'thấp' : option.coverageLevel === 'partial' ? 'một phần' : 'tốt'}
                              </div>
                            )}
                            {option.recommended && <div style={recommendedBadgeStyle}>Tốt nhất</div>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          <div style={inlineMetricStyle}>Trễ {formatDelay(option.delaySeconds)}</div>
                          <div style={inlineMetricStyle}>Điểm {option.congestionScore.toFixed(2)}</div>
                        </div>

                        <div
                          style={{
                            fontSize: option.recommended ? 12 : 11,
                            color: option.recommended ? '#334155' : '#7c3aed',
                            lineHeight: 1.5,
                            marginTop: 8,
                            fontWeight: option.recommended ? 400 : 600,
                          }}
                        >
                          {option.tradeOff}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>Các bước chỉ đường</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {(route.steps || []).map((step, index) => (
                <div key={`${step.instruction}-${index}`} style={stepRowStyle}>
                  <div style={stepIndexStyle}>{index + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{step.instruction}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {formatDistance(step.distanceMeters)}
                    </div>
                  </div>
                </div>
              ))}
              {(!route.steps || route.steps.length === 0) && (
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                  Không có hướng dẫn từng bước cho tuyến đường này.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const metricCardStyle: React.CSSProperties = {
  background: '#eff6ff',
  borderRadius: 12,
  padding: '12px 14px',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#1d4ed8',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#0f172a',
  marginTop: 4,
};

const stepRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 12px',
  borderRadius: 12,
  background: '#f8fafc',
};

const stepIndexStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  background: '#dbeafe',
  color: '#1d4ed8',
  fontSize: 12,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const recommendationCardStyle: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: '#f5f3ff',
  border: '1px solid #ddd6fe',
};

const recommendationLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#7c3aed',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const optionRowStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
};

const recommendedBadgeStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 999,
  background: '#7c3aed',
  color: 'white',
  fontSize: 11,
  fontWeight: 700,
};

const inlineMetricStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 999,
  background: '#f8fafc',
  color: '#334155',
  fontSize: 11,
  fontWeight: 700,
};

const inlineChipStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 999,
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#475569',
  fontSize: 11,
  fontWeight: 700,
};

export default RouteSummaryPanel;
