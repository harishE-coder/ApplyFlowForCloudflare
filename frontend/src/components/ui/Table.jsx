import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export function Table({
  columns = [],
  data = [],
  isLoading = false,
  emptyMessage = 'No records found',
  onRowClick,
  selectedId,
  idKey = 'id',
  className,
  pagination, // { page, pageSize, total, onPageChange }
}) {
  return (
    <div className={cn('w-full flex flex-col bg-white rounded-[24px] border border-[#E2E8F0] shadow-card overflow-hidden card-bevel', className)}>
      <div className="w-full overflow-x-auto max-h-[70vh]">
        <table className="w-full text-left border-collapse text-small">
          <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-[#E2E8F0] shadow-[0_1px_3px_rgba(8,18,38,0.03)]">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  className={cn(
                    'px-5 py-3.5 text-[11px] font-bold text-[#64748B] uppercase tracking-wider select-none whitespace-nowrap',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.headerClassName
                  )}
                  style={{ width: col.width }}
                >
                  <div className={cn('flex items-center gap-1.5', col.align === 'right' && 'justify-end', col.align === 'center' && 'justify-center')}>
                    <span>{col.title}</span>
                    {col.sortable && <ChevronsUpDown className="w-3.5 h-3.5 text-[#94A3B8] hover:text-[#081226] transition-colors" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F1F5F9]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 skeleton-shimmer rounded-[8px] w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-16 text-center text-[#64748B]">
                  <p className="font-display text-small font-bold text-[#475569]">{emptyMessage}</p>
                  <p className="text-caption text-[#94A3B8] mt-1 font-medium">Try adjusting your active filters or search terms</p>
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => {
                const isSelected = selectedId !== undefined && row[idKey] === selectedId;
                return (
                  <tr
                    key={row[idKey] || rowIdx}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'transition-colors duration-150 group',
                      rowIdx % 2 === 1 ? 'bg-[#FAFCFE]/60' : 'bg-white',
                      onRowClick ? 'cursor-pointer hover:bg-[#F8FAFC]' : 'hover:bg-[#F8FAFC]/70',
                      isSelected ? 'bg-gradient-to-r from-[#EFF6FF] to-white hover:bg-[#DBEAFE]/70 border-l-[3.5px] border-[#2563EB] shadow-2xs font-semibold' : ''
                    )}
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={col.key || colIdx}
                        className={cn(
                          'px-5 py-3.5 text-[#081226] align-middle whitespace-nowrap text-small',
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center',
                          col.className
                        )}
                      >
                        {col.render ? col.render(row[col.key], row, rowIdx) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between gap-4 text-caption text-[#64748B] shrink-0 font-medium">
          <div>
            Showing <span className="font-bold text-[#081226]">{Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)}</span> to{' '}
            <span className="font-bold text-[#081226]">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> of{' '}
            <span className="font-bold text-[#081226]">{pagination.total}</span> entries
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="p-1.5 rounded-xl border border-[#E2E8F0] bg-white text-[#081226] hover:bg-[#F1F5F9] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer shadow-2xs"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 py-1 text-[11.5px] font-bold text-[#081226] bg-white border border-[#E2E8F0] rounded-xl shadow-2xs">
              Page {pagination.page}
            </span>
            <button
              type="button"
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="p-1.5 rounded-xl border border-[#E2E8F0] bg-white text-[#081226] hover:bg-[#F1F5F9] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer shadow-2xs"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Table;
