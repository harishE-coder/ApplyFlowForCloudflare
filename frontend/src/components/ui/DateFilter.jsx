import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export const DATE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'custom', label: 'Custom Date' },
];

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

export function DateFilter({
  selectedPreset = 'today',
  customDate = new Date().toISOString().split('T')[0],
  onFilterChange,
  className,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalDate, setInternalDate] = useState(customDate || new Date().toISOString().split('T')[0]);

  React.useEffect(() => {
    if (customDate) setInternalDate(customDate);
  }, [customDate]);

  const handleSelectPreset = (presetId) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (presetId === 'today') {
      onFilterChange?.({ preset: 'today', customDate: todayStr });
    } else if (presetId === 'yesterday') {
      onFilterChange?.({ preset: 'yesterday', customDate: yesterdayStr });
    } else if (presetId === 'custom') {
      onFilterChange?.({ preset: 'custom', customDate: internalDate });
    } else {
      onFilterChange?.({ preset: presetId, customDate: null });
    }
    setIsOpen(false);
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setInternalDate(newDate);
    onFilterChange?.({ preset: 'custom', customDate: newDate });
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#F1F5F9] border border-[#E2E8F0] shadow-xs', className)}>
      {DATE_PRESETS.map((preset) => {
        const isActive = selectedPreset === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleSelectPreset(preset.id)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-caption font-bold transition-all select-none cursor-pointer flex items-center gap-1.5',
              isActive
                ? 'bg-white text-[#0D6EFD] shadow-xs border border-[#BFDBFE]'
                : 'text-[#64748B] hover:text-[#081226] hover:bg-white/60'
            )}
          >
            {preset.id === 'custom' && <CalendarIcon className="w-3.5 h-3.5 shrink-0 text-[#0D6EFD]" />}
            <span>{preset.label}</span>
          </button>
        );
      })}

      {/* When Custom Date is active, render interactive inline date picker */}
      {selectedPreset === 'custom' && (
        <div className="flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 border-l border-[#CBD5E1]">
          <input
            type="date"
            value={internalDate}
            onChange={handleDateChange}
            className="h-[30px] px-2 rounded-lg text-caption font-bold bg-white text-[#081226] border border-[#BFDBFE] shadow-xs focus:outline-none focus:border-[#0D6EFD] cursor-pointer"
          />
          <span className="text-[11px] font-bold text-[#0D6EFD] hidden sm:inline">
            {formatDateDisplay(internalDate)}
          </span>
        </div>
      )}
    </div>
  );
}

export default DateFilter;
