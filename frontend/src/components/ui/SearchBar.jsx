import React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/utils/cn';

export function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = 'Search candidates, companies, roles, resume IDs...',
  className,
  containerClassName,
  showShortcut = false,
  shortcutKey = '⌘K',
  autoFocus = false,
  onKeyDown,
}) {
  return (
    <div className={cn('relative flex items-center w-full group', containerClassName)}>
      <div className="absolute left-3.5 flex items-center pointer-events-none text-[#94A3B8] group-focus-within:text-[#2563EB] transition-colors">
        <Search className="w-4 h-4 transition-transform group-focus-within:scale-105" />
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cn(
          'w-full h-[44px] pl-10 pr-16 rounded-[14px] text-small bg-white text-[#081226] placeholder-[#94A3B8]',
          'border border-[#E2E8F0] shadow-xs transition-all duration-150',
          'hover:border-[#CBD5E1]',
          'focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/14 focus:shadow-sm',
          className
        )}
      />

      <div className="absolute right-3 flex items-center gap-1.5">
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange?.('');
              onClear?.();
            }}
            className="p-1 text-[#94A3B8] hover:text-[#081226] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {showShortcut && (
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10.5px] font-bold text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] rounded-md shadow-2xs group-focus-within:border-[#BFDBFE] group-focus-within:text-[#2563EB] transition-colors">
            {shortcutKey}
          </kbd>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
