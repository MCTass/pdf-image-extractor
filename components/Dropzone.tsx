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
      
      <div className="flex flex-col items-center gap-6 text-center px-8 z-0">
        <div className={`
          p-6 rounded-[2rem] transition-all duration-500 shadow-2xl
          ${isDragOver ? 'bg-indigo-500 text-white scale-110 rotate-12' : 'bg-slate-800 text-slate-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 group-hover:scale-105 group-hover:-rotate-3'}
        `}>
          {isDragOver ? <FileUp size={40} /> : <Upload size={40} />}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-white tracking-tight">
            {isProcessing ? 'Analyzing Core Data...' : 'Drop PDF Here'}
          </h3>
          <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto leading-relaxed">
            Ready to extract diagrams and images. <br className="hidden sm:block" />
            <span className="text-indigo-400/80">Click or drag to begin.</span>
          </p>
        </div>
      </div>

      {/* Background Decorative Element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[100px] -mr-16 -mt-16 rounded-full" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 blur-[100px] -ml-16 -mb-16 rounded-full" />
    </div>
  );
};

export default Dropzone;