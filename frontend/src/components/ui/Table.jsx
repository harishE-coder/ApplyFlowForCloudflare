import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
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
    <div className={cn('w-full flex flex-col bg-white rounded-[20px] border border-[#E2E8F0] shadow-card overflow-hidden', className)}>
      <div className="w-full overflow-x-auto max-h-[70vh]">
        <table className="w-full text-left border-collapse text-small">
          <thead className="sticky top-0 z-10 bg-[#F8FAFC]/95 backdrop-blur-md border-b border-[#E2E8F0] shadow-[0_1px_2px_rgba(8,18,38,0.03)]">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  className={cn(
                    'px-5 py-3.5 text-caption font-semibold text-[#64748B] uppercase tracking-wider select-none whitespace-nowrap',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.headerClassName
                  )}
                  style={{ width: col.width }}
                >
                  <div className={cn('flex items-center gap-1.5', col.align === 'right' && 'justify-end', col.align === 'center' && 'justify-center')}>
                    <span>{col.title}</span>
                    {col.sortable && <ChevronsUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />}
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
                      <div className="h-4 skeleton-shimmer rounded-[6px] w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-14 text-center text-[#64748B]">
                  <p className="text-small font-medium">{emptyMessage}</p>
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
                      rowIdx % 2 === 1 ? 'bg-[#FAFBFD]/60' : 'bg-white',
                      onRowClick ? 'cursor-pointer hover:bg-[#F1F5F9]/80' : 'hover:bg-[#F8FAFC]/70',
                      isSelected ? 'bg-[#EFF6FF] hover:bg-[#DBEAFE]/80' : ''
                    )}
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={col.key || colIdx}
                        className={cn(
                          'px-5 py-3.5 text-[#081226] align-middle whitespace-nowrap',
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
        <div className="px-5 py-3.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between gap-4 text-caption text-[#64748B]">
          <div>
            Showing <span className="font-semibold text-[#081226]">{Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)}</span> to{' '}
            <span className="font-semibold text-[#081226]">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> of{' '}
            <span className="font-semibold text-[#081226]">{pagination.total}</span> entries
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="p-1.5 rounded-[10px] border border-[#E2E8F0] bg-white text-[#081226] hover:bg-[#F1F5F9] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-semibold text-[#081226]">Page {pagination.page}</span>
            <button
              type="button"
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="p-1.5 rounded-[10px] border border-[#E2E8F0] bg-white text-[#081226] hover:bg-[#F1F5F9] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
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
