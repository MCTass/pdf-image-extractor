import React, { useCallback, useState } from 'react';
import { Upload, FileType, FileUp } from 'lucide-react';

interface DropzoneProps {
  onFileAccepted: (file: File) => void;
  isProcessing: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFileAccepted, isProcessing }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (isProcessing) return;

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      onFileAccepted(files[0]);
    }
  }, [onFileAccepted, isProcessing]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) return;
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileAccepted(files[0]);
    }
  }, [onFileAccepted, isProcessing]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-full max-w-2xl mx-auto h-72 rounded-[2.5rem] border-2 border-dashed transition-all duration-500 ease-out flex flex-col items-center justify-center cursor-pointer group overflow-hidden
        ${isDragOver 
          ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02] shadow-[inset_0_0_60px_rgba(99,102,241,0.1)]' 
          : 'border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/20 bg-slate-900/10'
        }
        ${isProcessing ? 'opacity-40 cursor-not-allowed grayscale' : ''}
      `}
    >
      <input
        type="file"
        accept="application/pdf"
        onChange={handleInputChange}
        disabled={isProcessing}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
      />
      
      <div className="flex flex-col items-center gap-5 text-center px-8 z-0">
        <div className={`
          p-5 rounded-2xl transition-all duration-500 shadow-2xl border
          ${isDragOver 
            ? 'bg-indigo-600 text-white scale-110 rotate-3 border-indigo-400 shadow-indigo-500/30' 
            : 'bg-slate-900/90 text-slate-400 border-slate-800/80 group-hover:text-indigo-400 group-hover:border-indigo-500/40 group-hover:bg-slate-800/90 group-hover:scale-105 group-hover:-rotate-1 shadow-black/40'}
        `}>
          {isDragOver ? <FileUp size={36} className="animate-bounce" /> : <Upload size={36} />}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            {isProcessing ? 'Extracting Text & Figures...' : 'Drop your PDF document here'}
          </h3>
          <p className="text-sm font-normal text-slate-400 max-w-md mx-auto leading-relaxed">
            Drag and drop your paper, report, or spec, or <span className="text-indigo-400 font-medium underline underline-offset-4 decoration-indigo-500/40 group-hover:decoration-indigo-400">browse files</span>
          </p>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <span className="px-2.5 py-1 text-[11px] font-medium bg-slate-800/60 text-slate-400 border border-slate-700/50 rounded-full">
            📄 Full PDF Parsing
          </span>
          <span className="px-2.5 py-1 text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full">
            ✨ Vision AI Asset Naming
          </span>
          <span className="px-2.5 py-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full">
            📝 AI README Synthesis
          </span>
        </div>
      </div>

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[90px] pointer-events-none rounded-full" />
    </div>
  );
};

export default Dropzone;