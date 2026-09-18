import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Reusable, responsive pagination component for ApplyFlow tables and feeds.
 *
 * @param {number} page - Current active page (1-indexed)
 * @param {number} pageSize - Number of records displayed per page (default: 20)
 * @param {number} total - Total records count across all pages
 * @param {function} onPageChange - Callback when a page is selected: (newPage) => void
 * @param {string} [itemName='applications'] - Entity name for range display ('applications', 'candidates', etc.)
 * @param {boolean} [isLoading=false] - Whether data is currently loading
 * @param {string} [className=''] - Optional outer wrapper styling classes
 */
export function Pagination({
  page = 1,
  pageSize = 20,
  total = 0,
  onPageChange,
  itemName = 'applications',
  isLoading = false,
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const startRecord = total > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(safePage * pageSize, total);

  // Generate pagination items with smart ellipsis
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (safePage <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }

    if (safePage >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages];
  };

  const pages = getPageNumbers();

  const handlePageClick = (p) => {
    if (typeof p !== 'number' || p === safePage || p < 1 || p > totalPages || isLoading) return;
    onPageChange?.(p);
  };

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs select-none transition-all',
        className
      )}
      aria-label="Pagination Navigation"
    >
      {/* Range Counter */}
      <div className="text-caption sm:text-small text-[#64748B] text-center sm:text-left">
        Showing{' '}
        <strong className="font-bold text-[#081226]">
          {startRecord}–{endRecord}
        </strong>{' '}
        of <strong className="font-bold text-[#081226]">{total}</strong> {itemName}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
        {/* Previous Button */}
        <button
          type="button"
          onClick={() => handlePageClick(safePage - 1)}
          disabled={safePage <= 1 || isLoading}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-caption sm:text-small font-bold transition-all border cursor-pointer',
            safePage <= 1 || isLoading
              ? 'bg-[#F8FAFC] text-[#94A3B8] border-[#E2E8F0] cursor-not-allowed opacity-60'
              : 'bg-white text-[#081226] border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:scale-[0.98]'
          )}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Previous</span>
        </button>

        {/* Page Number Buttons */}
        <div className="flex items-center gap-1">
          {pages.map((p, idx) => {
            if (p === '...') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-caption font-bold text-[#94A3B8]"
                >
                  …
                </span>
              );
            }

            const isCurrent = p === safePage;
            return (
              <button
                key={`page-${p}`}
                type="button"
                onClick={() => handlePageClick(p)}
                disabled={isLoading}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-caption sm:text-small font-bold transition-all cursor-pointer flex items-center justify-center',
                  isCurrent
                    ? 'bg-[#2563EB] text-white shadow-xs border border-[#2563EB]'
                    : 'bg-white text-[#475569] hover:text-[#081226] hover:bg-[#F1F5F9] border border-[#E2E8F0]'
                )}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={() => handlePageClick(safePage + 1)}
          disabled={safePage >= totalPages || isLoading}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-caption sm:text-small font-bold transition-all border cursor-pointer',
            safePage >= totalPages || isLoading
              ? 'bg-[#F8FAFC] text-[#94A3B8] border-[#E2E8F0] cursor-not-allowed opacity-60'
              : 'bg-white text-[#081226] border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:scale-[0.98]'
          )}
          aria-label="Go to next page"
        >
          <span className="hidden xs:inline">Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
