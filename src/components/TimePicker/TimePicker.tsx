'use client';

/**
 * TimePicker - Component for selecting future time for prediction
 *
 * Allows user to pick a specific future time for traffic prediction
 */

import React, { useState, useEffect } from 'react';

export interface TimeSelection {
  type: 'preset' | 'custom';
  horizon?: 'now' | '+15' | '+30' | '+60';
  customTime?: Date;
}

interface TimePickerProps {
  value: TimeSelection;
  onChange: (value: TimeSelection) => void;
  loading?: boolean;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  loading = false,
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customHour, setCustomHour] = useState(new Date().getHours());
  const [customMinute, setCustomMinute] = useState(new Date().getMinutes());

  // Get display time
  const getDisplayTime = () => {
    if (value.type === 'preset' && value.horizon === 'now') {
      return 'Hiện tại';
    }
    if (value.type === 'preset') {
      const offset = parseInt(value.horizon!.slice(1));
      const futureTime = new Date(Date.now() + offset * 60 * 1000);
      return `+${offset} phút (${formatTime(futureTime)})`;
    }
    if (value.type === 'custom' && value.customTime) {
      return formatTime(value.customTime);
    }
    return 'Hiện tại';
  };

  // Format time to HH:MM
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Handle preset selection
  const handlePresetClick = (horizon: 'now' | '+15' | '+30' | '+60') => {
    onChange({ type: 'preset', horizon });
    setShowCustomPicker(false);
  };

  // Handle custom time submission
  const handleCustomTimeSubmit = () => {
    const now = new Date();
    const customTime = new Date();
    customTime.setHours(customHour);
    customTime.setMinutes(customMinute);
    customTime.setSeconds(0);

    // If custom time is in the past, set to tomorrow
    if (customTime < now) {
      customTime.setDate(customTime.getDate() + 1);
    }

    onChange({ type: 'custom', customTime });
    setShowCustomPicker(false);
  };

  // Check if custom time is today or tomorrow
  const getTimeLabel = () => {
    if (value.type === 'preset') {
      return getDisplayTime();
    }

    if (value.type === 'custom' && value.customTime) {
      const now = new Date();
      const isToday = value.customTime.toDateString() === now.toDateString();
      const isTomorrow = new Date(value.customTime.getDate() + 1) > now;

      if (isToday) {
        return `Hôm nay, ${formatTime(value.customTime)}`;
      }
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (value.customTime.toDateString() === tomorrow.toDateString()) {
        return `Ngày mai, ${formatTime(value.customTime)}`;
      }
      return value.customTime.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return getDisplayTime();
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'white',
        padding: '14px 20px',
        borderRadius: 14,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 400,
      }}
    >
      {/* Current selection display */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⏰</span>
          <div>
            <div style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>
              Thời điểm dự báo:
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1976d2' }}>
              {getTimeLabel()}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #e0e0e0',
            background: showCustomPicker ? '#1976d2' : 'white',
            color: showCustomPicker ? 'white' : '#333',
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {showCustomPicker ? '✓ Đóng' : '⚙ Chọn giờ'}
        </button>
      </div>

      {/* Preset buttons */}
      {!showCustomPicker && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {([
            { value: 'now' as const, label: 'Hiện tại', icon: '📍' },
            { value: '+15' as const, label: '+15 phút', icon: '🔮' },
            { value: '+30' as const, label: '+30 phút', icon: '🔮' },
            { value: '+60' as const, label: '+60 phút', icon: '🔮' },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => handlePresetClick(option.value)}
              disabled={loading}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: value.type === 'preset' && value.horizon === option.value
                  ? '2px solid #1976d2'
                  : '1px solid #e0e0e0',
                background: value.type === 'preset' && value.horizon === option.value
                  ? '#e3f2fd'
                  : 'white',
                color: value.type === 'preset' && value.horizon === option.value
                  ? '#1976d2'
                  : '#333',
                fontSize: 13,
                fontWeight: value.type === 'preset' && value.horizon === option.value
                  ? 600
                  : 400,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Custom time picker */}
      {showCustomPicker && (
        <div
          style={{
            padding: '16px',
            background: '#f8f9fa',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            📅 Chọn giờ cụ thể:
          </div>

          {/* Quick time buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: '7:00 (Giờ cao điểm sáng)', hour: 7, minute: 0 },
              { label: '8:30', hour: 8, minute: 30 },
              { label: '12:00 (Trưa)', hour: 12, minute: 0 },
              { label: '17:00 (Giờ cao điểm chiều)', hour: 17, minute: 0 },
              { label: '18:30', hour: 18, minute: 30 },
              { label: '21:00 (Tối)', hour: 21, minute: 0 },
            ].map((time) => (
              <button
                key={time.label}
                onClick={() => {
                  const now = new Date();
                  const customTime = new Date();
                  customTime.setHours(time.hour);
                  customTime.setMinutes(time.minute);
                  customTime.setSeconds(0);
                  if (customTime < now) {
                    customTime.setDate(customTime.getDate() + 1);
                  }
                  onChange({ type: 'custom', customTime });
                  setShowCustomPicker(false);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e0e0e0',
                  background: value.type === 'custom' && value.customTime?.getHours() === time.hour && value.customTime?.getMinutes() === time.minute
                    ? '#1976d2'
                    : 'white',
                  color: value.type === 'custom' && value.customTime?.getHours() === time.hour && value.customTime?.getMinutes() === time.minute
                    ? 'white'
                    : '#333',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {time.label}
              </button>
            ))}
          </div>

          {/* Custom time input */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#666', marginBottom: 4, display: 'block' }}>
                Giờ:
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={customHour}
                onChange={(e) => setCustomHour(parseInt(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e0e0e0',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#666', marginBottom: 4, display: 'block' }}>
                Phút:
              </label>
              <input
                type="number"
                min="0"
                max="59"
                value={customMinute}
                onChange={(e) => setCustomMinute(parseInt(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e0e0e0',
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={handleCustomTimeSubmit}
            style={{
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: '#1976d2',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginTop: 4,
            }}
          >
            ✓ Dự báo cho {customHour.toString().padStart(2, '0')}:{customMinute.toString().padStart(2, '0')}
          </button>
        </div>
      )}
    </div>
  );
};

export default TimePicker;
