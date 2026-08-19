
import React, { useState, useEffect } from 'react';
import { ExtractedImage } from '../types';
// Added missing Loader2 import
import { Download, Sparkles, RefreshCw, XCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
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
    pending: 'bg-slate-500',
    analyzing: 'bg-indigo-500 animate-pulse',
    done: 'bg-emerald-500 shadow-lg shadow-emerald-500/20',
    error: 'bg-red-500'
  };

  return (
    <div 
        className={`
            relative rounded-2xl overflow-hidden border transition-all duration-300 group
            ${isSelected 
              ? 'bg-indigo-500/5 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xl shadow-indigo-500/10' 
              : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 shadow-lg hover:shadow-indigo-500/5'
            }
        `}
        onClick={() => onToggleSelect(image.id)}
    >
      {/* Selection Checkbox */}
      <div className="absolute top-3 left-3 z-30 transition-transform duration-300 group-hover:scale-110">
          {isSelected ? (
              <CheckCircle2 className="text-indigo-400 fill-indigo-400/20" size={24} />
          ) : (
              <Circle className="text-white/20 group-hover:text-white/40" size={24} />
          )}
      </div>

      {/* Image Preview Area */}
      <div 
        className="relative aspect-square bg-slate-900/50 flex items-center justify-center p-2 overflow-hidden"
        title={image.caption || "No caption available"}
      >
        {previewUrl ? (
          <img 
            src={previewUrl} 
            alt="Extracted" 
            className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <Loader2 size={24} className="text-slate-700 animate-spin" />
        )}
        
        {/* Status Badge */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor[image.status]}`} />
        </div>
        
        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-[2px]">
            <button 
                onClick={handleDownload}
                className="p-3 bg-white text-slate-900 hover:bg-indigo-500 hover:text-white rounded-xl shadow-2xl transition-all hover:scale-110 active:scale-95"
                title="Download"
            >
                <Download size={20} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                className="p-3 bg-red-500/90 text-white hover:bg-red-600 rounded-xl shadow-2xl transition-all hover:scale-110 active:scale-95"
                title="Remove"
            >
                <XCircle size={20} />
            </button>
        </div>

        {/* Resolution Badge */}
        <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 text-[10px] font-bold text-slate-300 rounded-lg backdrop-blur-md border border-white/5 uppercase tracking-wider">
           {image.width} × {image.height}
        </div>
         <div className="absolute bottom-3 right-3 px-2 py-1 bg-indigo-500/80 text-[10px] font-bold text-white rounded-lg backdrop-blur-md border border-white/10 shadow-lg">
           PAGE {image.pageIndex}
        </div>
      </div>

      {/* Details Area */}
      <div className="p-4 bg-slate-900/20" onClick={(e) => e.stopPropagation()}>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
          Suggested Filename
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={image.suggestedName}
            onChange={(e) => onRename(image.id, e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            className={`
              w-full bg-slate-950/80 border rounded-xl px-3 py-2 text-sm text-slate-200 outline-none transition-all
              ${isEditing ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-800 hover:border-slate-700'}
            `}
            placeholder="filename"
          />
          <button 
            onClick={() => onRegenerateName(image.id)}
            disabled={image.status === 'analyzing'}
            className={`
              shrink-0 p-2.5 rounded-xl border transition-all
              ${image.status === 'analyzing' 
                ? 'bg-slate-800 border-slate-800 text-slate-500' 
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500 hover:text-white shadow-lg shadow-indigo-500/5'}
            `}
            title="AI Regenerate"
          >
            {image.status === 'analyzing' ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
          </button>
        </div>
        {image.caption && (
          <p className="mt-2 text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-950/40 p-1.5 rounded-lg border border-slate-800/60">
            {image.caption}
          </p>
        )}
      </div>
    </div>
  );
};

export default ImageCard;
