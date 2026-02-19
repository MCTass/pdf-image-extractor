import React, { useCallback, useState } from 'react';
import { Upload, FileType } from 'lucide-react';

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
        relative w-full max-w-2xl mx-auto h-64 rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out flex flex-col items-center justify-center cursor-pointer group
        ${isDragOver 
          ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
          : 'border-slate-700 hover:border-indigo-400 hover:bg-slate-800/50 bg-slate-800/20'
        }
        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        type="file"
        accept="application/pdf"
        onChange={handleInputChange}
        disabled={isProcessing}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <div className={`
          p-4 rounded-full transition-colors duration-300
          ${isDragOver ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 group-hover:text-indigo-400 group-hover:bg-slate-700/80'}
        `}>
          {isDragOver ? <FileType size={32} /> : <Upload size={32} />}
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-slate-200 mb-1">
            {isProcessing ? 'Processing PDF...' : 'Upload your PDF'}
          </h3>
          <p className="text-sm text-slate-400 max-w-sm">
            Drag & drop a PDF file here, or click to browse. We'll extract images and name them for you.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dropzone;
