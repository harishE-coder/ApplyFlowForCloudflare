import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Select = forwardRef(({
  label,
  error,
  helperText,
  icon: Icon,
  className,
  containerClassName,
  disabled = false,
  required = false,
  options = [],
  children,
  placeholder = 'Select option...',
  id,
  ...props
}, ref) => {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className={cn('w-full flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-[12.5px] font-semibold text-[#334155] flex items-center justify-between"
        >
          <span>
            {label} {required && <span className="text-[#EF4444]">*</span>}
          </span>
        </label>
      )}

      <div className="relative flex items-center w-full group">
        {Icon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-[#94A3B8] group-focus-within:text-[#2563EB] transition-colors">
            <Icon className="w-4.5 h-4.5" />
          </div>
        )}

        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          className={cn(
            'w-full h-[44px] px-3.5 rounded-[13px] text-small bg-white text-[#081226] appearance-none pr-10',
            'border border-[#E2E8F0] shadow-xs transition-all duration-150 cursor-pointer',
            'hover:border-[#CBD5E1]',
            'focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/12 focus:shadow-sm',
            'disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] disabled:cursor-not-allowed',
            Icon && 'pl-10.5',
            error && 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/12 animate-input-shake',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.length > 0
            ? options.map((opt) => (
                <option key={opt.value ?? opt} value={opt.value ?? opt}>
                  {opt.label ?? opt}
                </option>
              ))
            : children}
        </select>

        <div className="absolute right-3.5 flex items-center pointer-events-none text-[#64748B] group-focus-within:text-[#2563EB] transition-colors">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>

      {error ? (
        <p className="text-caption font-semibold text-[#EF4444] mt-0.5">{error}</p>
      ) : helperText ? (
        <p className="text-caption text-[#64748B] mt-0.5">{helperText}</p>
      ) : null}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;
