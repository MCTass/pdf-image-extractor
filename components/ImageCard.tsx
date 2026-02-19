import React, { useState, useEffect } from 'react';
import { ExtractedImage } from '../types';
import { Download, Sparkles, RefreshCw, XCircle, CheckCircle2, Circle } from 'lucide-react';
import { downloadBlob } from '../utils/fileUtils';

interface ImageCardProps {
  image: ExtractedImage;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onRegenerateName: (id: string) => void;
  onDelete: (id: string) => void;
}

const ImageCard: React.FC<ImageCardProps> = ({ 
    image, 
    isSelected,
    onToggleSelect,
    onRename, 
    onRegenerateName, 
    onDelete 
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(image.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image.blob]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadBlob(image.blob, `${image.suggestedName || image.originalName}.png`);
  };

  const statusColor = {
    pending: 'bg-slate-600',
    analyzing: 'bg-indigo-600 animate-pulse',
    done: 'bg-green-600',
    error: 'bg-red-600'
  };

  return (
    <div 
        className={`
            relative rounded-lg overflow-hidden border shadow-lg transition-all cursor-pointer group
            ${isSelected ? 'bg-indigo-900/20 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}
        `}
        onClick={() => onToggleSelect(image.id)}
    >
      {/* Selection Checkbox */}
      <div className="absolute top-2 left-2 z-20 text-white">
          {isSelected ? (
              <CheckCircle2 className="text-indigo-400 fill-indigo-400/20" size={20} />
          ) : (
              <Circle className="text-white/50 hover:text-white" size={20} />
          )}
      </div>

      {/* Image Preview Area */}
      <div className="relative aspect-square bg-slate-900/50 flex items-center justify-center p-2 overflow-hidden">
        {previewUrl ? (
          <img 
            src={previewUrl} 
            alt="Extracted" 
            className="max-w-full max-h-full object-contain rounded-sm"
          />
        ) : (
          <div className="w-8 h-8 rounded-full border-2 border-slate-600 border-t-transparent animate-spin" />
        )}
        
        {/* Status Badge */}
        <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${statusColor[image.status]}`} title={image.status} />
        
        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
            <button 
                onClick={handleDownload}
                className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-white transition-colors"
                title="Download"
            >
                <Download size={18} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                className="p-2 bg-red-900/80 hover:bg-red-800 rounded-full text-white transition-colors"
                title="Remove"
            >
                <XCircle size={18} />
            </button>
        </div>

        {/* Resolution Badge */}
        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/50 text-[10px] text-slate-300 rounded backdrop-blur-sm">
           {image.width} × {image.height}
        </div>
         <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/50 text-[10px] text-slate-300 rounded backdrop-blur-sm">
           P{image.pageIndex}
        </div>
      </div>

      {/* Details Area */}
      <div className="p-3" onClick={(e) => e.stopPropagation()}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Filename
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={image.suggestedName}
            onChange={(e) => onRename(image.id, e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            className={`
              w-full bg-slate-900 border rounded px-2 py-1.5 text-sm text-slate-200 outline-none transition-colors
              ${isEditing ? 'border-indigo-500' : 'border-slate-700 hover:border-slate-600'}
            `}
            placeholder="filename"
          />
          <button 
            onClick={() => onRegenerateName(image.id)}
            disabled={image.status === 'analyzing'}
            className="shrink-0 p-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-indigo-300 rounded border border-slate-600 transition-colors"
            title="Regenerate Name with AI"
          >
            {image.status === 'analyzing' ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCard;