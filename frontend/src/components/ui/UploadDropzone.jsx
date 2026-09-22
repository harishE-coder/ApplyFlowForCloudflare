import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { UploadHeroIllustration } from '@/assets/illustrations/ATSIllustrations';
import { Button } from './Button';
import { cn } from '@/utils/cn';

export const UploadDropzone = React.memo(function UploadDropzone({
  onFilesSelected,
  accept = '.pdf,application/pdf',
  maxFiles = 50,
  maxSizeMB = 10,
  isProcessing = false,
  className,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected?.(filesArray);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected?.(filesArray);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        'relative rounded-[24px] border-2 border-dashed transition-all duration-200 p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer select-none group card-bevel',
        isDragOver
          ? 'border-[#2563EB] bg-[#EFF6FF] shadow-[0_0_32px_rgba(37,99,235,0.22)] scale-[1.01]'
          : 'border-[#CBD5E1] bg-[#F8FAFC]/70 hover:bg-white hover:border-[#94A3B8] hover:shadow-card',
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="mb-4 transform group-hover:scale-108 transition-transform duration-250 ease-out">
        <UploadHeroIllustration className="w-20 h-20 sm:w-24 sm:h-24 mx-auto" />
      </div>

      <h4 className="font-display text-h3 font-bold text-[#081226] tracking-tight">
        Drop resumes here, or <span className="text-[#2563EB] underline decoration-2 underline-offset-4 font-extrabold">browse files</span>
      </h4>

      <p className="text-small text-[#64748B] max-w-md mt-2 mb-5 leading-relaxed font-medium">
        Upload single or batches of candidate resumes (PDF). Automated filename parsing and duplicate check will execute automatically.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="primary"
          size="md"
          icon={Upload}
          isLoading={isProcessing}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="shadow-sm font-bold"
        >
          Choose PDF Files
        </Button>
      </div>

      <div className="mt-6 pt-4 border-t border-[#E2E8F0]/80 flex items-center justify-center gap-6 text-caption text-[#64748B] font-semibold">
        <span className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-[#2563EB]" />
          PDF resumes up to {maxSizeMB}MB each
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
          Auto Name & Role Detection
        </span>
      </div>
    </div>
  );
});

export default UploadDropzone;
