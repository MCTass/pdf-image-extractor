
import React, { useState } from 'react';
import Dropzone from './components/Dropzone';
import ImageCard from './components/ImageCard';
import ReadmePreview from './components/ReadmePreview';
import { ExtractedImage, ProcessingStatus, ReadmeSettings, ReadmeTone } from './types';
import { processPdf } from './services/pdfService';
import { suggestImageName, generateProjectReadme } from './services/geminiService';
import { createZip, downloadBlob } from './utils/fileUtils';
// Added missing Sparkles import
import { Images, FileDown, Loader2, Info, Github, FileText, Copy, Check, Settings2, Trash2, CheckSquare, Square, ArrowUpCircle, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pdfText, setPdfText] = useState<string>('');
  const [readme, setReadme] = useState<string>('');
  const [isGeneratingReadme, setIsGeneratingReadme] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [readmeView, setReadmeView] = useState<'edit' | 'preview'>('preview');
  
  const [settings, setSettings] = useState<ReadmeSettings>({
      tone: 'professional',
      context: ''
  });
  const [showSettings, setShowSettings] = useState(false);

  const handleFileAccepted = async (file: File) => {
    setStatus(ProcessingStatus.EXTRACTING);
    setError(null);
    setImages([]);
    setPdfText('');
    setReadme('');
    setProgress(0);
    setSelectedIds(new Set());

    try {
      const { images: extractedImages, text } = await processPdf(file, (current, total) => {
        setProgress(Math.round((current / total) * 100));
      });
      
      setPdfText(text);

      if (extractedImages.length === 0) {
        setError('No valid images found in this PDF.');
        setStatus(ProcessingStatus.IDLE);
        return;
      }

      const initialImages: ExtractedImage[] = extractedImages.map((img, idx) => ({
        id: `img-${Date.now()}-${idx}`,
        blob: img.blob,
        width: img.width,
        height: img.height,
        originalName: `image-${idx + 1}`,
        suggestedName: `image-${idx + 1}`,
        status: 'pending',
        pageIndex: img.pageIndex
      }));

      setImages(initialImages);
      setStatus(ProcessingStatus.ANALYZING);
      await processImagesQueue(initialImages);
      setStatus(ProcessingStatus.COMPLETE);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to process PDF.');
      setStatus(ProcessingStatus.ERROR);
    }
  };

  const processImagesQueue = async (items: ExtractedImage[]) => {
    const CONCURRENCY = 2;
    const queue = [...items];
    const chunks = [];
    while (queue.length > 0) chunks.push(queue.splice(0, CONCURRENCY));

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        await Promise.all(chunk.map(async (img) => {
            setImages(prev => prev.map(p => p.id === img.id ? { ...p, status: 'analyzing' } : p));
            const name = await suggestImageName(img.blob);
            setImages(prev => prev.map(p => p.id === img.id ? { ...p, suggestedName: name, status: 'done' } : p));
        }));
        if (i < chunks.length - 1) await new Promise(resolve => setTimeout(resolve, 1500));
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === images.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(images.map(i => i.id)));
  };

  const bulkDelete = () => {
      if (!confirm(`Delete ${selectedIds.size} images?`)) return;
      setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
      setSelectedIds(new Set());
  };

  const bulkDownload = async () => {
      const selectedImages = images.filter(img => selectedIds.has(img.id));
      if (selectedImages.length === 0) return;
      const zipBlob = await createZip(selectedImages);
      downloadBlob(zipBlob, 'selected-images.zip');
  };

  const handleRegenerateName = async (id: string) => {
    const img = images.find(i => i.id === id);
    if (!img) return;
    setImages(prev => prev.map(p => p.id === id ? { ...p, status: 'analyzing' } : p));
    const name = await suggestImageName(img.blob);
    setImages(prev => prev.map(p => p.id === id ? { ...p, suggestedName: name, status: 'done' } : p));
  };

  const handleRename = (id: string, newName: string) => {
    setImages(prev => prev.map(p => p.id === id ? { ...p, suggestedName: newName } : p));
  };

  const handleDelete = (id: string) => {
    setImages(prev => prev.filter(p => p.id !== id));
    if (selectedIds.has(id)) {
        const newSet = new Set(selectedIds);
        newSet.delete(id);
        setSelectedIds(newSet);
    }
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    const zipBlob = await createZip(images);
    downloadBlob(zipBlob, 'extracted-images.zip');
  };

  const handleGenerateReadme = async () => {
      if (!pdfText) return;
      setIsGeneratingReadme(true);
      const currentNames = images.map(i => i.suggestedName);
      const markdown = await generateProjectReadme(pdfText, currentNames, settings);
      setReadme(markdown);
      setIsGeneratingReadme(false);
      setReadmeView('preview');
  };

  const handleCopyReadme = () => {
      navigator.clipboard.writeText(readme);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setImages([]);
    setStatus(ProcessingStatus.IDLE);
    setError(null);
    setProgress(0);
    setReadme('');
    setPdfText('');
    setSelectedIds(new Set());
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] selection:bg-indigo-500/30">
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-[100]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg shadow-lg shadow-indigo-500/20">
              <Images className="text-white" size={20} />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-base md:text-lg text-slate-100 leading-tight">Extractor</h1>
              <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">Gemini Intelligence</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-6">
             {images.length > 0 && (
                <button 
                  onClick={handleReset}
                  className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Start Over
                </button>
             )}
             <a href="https://github.com" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-transform hover:scale-110">
                <Github size={20} />
             </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 md:px-8 py-6 md:py-10">
        {error && (
            <div className="mb-8 p-4 bg-red-900/20 border border-red-800/50 rounded-xl flex items-center gap-3 text-red-200 animate-in fade-in zoom-in-95 duration-300">
                <Info size={20} className="shrink-0" />
                <p className="text-sm">{error}</p>
            </div>
        )}

        {images.length === 0 && (status === ProcessingStatus.IDLE || status === ProcessingStatus.EXTRACTING) && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
             <div className="w-full max-w-3xl mb-10 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">
                   <Sparkles size={14} /> New: Advanced Image Detection
                </div>
                <h2 className="text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.1]">
                    Extract <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">PDF Images</span> Instantly.
                </h2>
                <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                    Automatically extract diagrams, screenshots, and photos. AI-generated filenames and README templates ready for production.
                </p>
             </div>
             
             <Dropzone 
                onFileAccepted={handleFileAccepted} 
                isProcessing={status === ProcessingStatus.EXTRACTING} 
             />

             {status === ProcessingStatus.EXTRACTING && (
                <div className="mt-10 flex flex-col items-center gap-4">
                    <div className="relative">
                        <Loader2 size={48} className="text-indigo-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                            {progress}%
                        </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Scanning Document...</p>
                </div>
             )}
          </div>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
            <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/60 p-3 md:p-4 flex flex-wrap items-center justify-between gap-4 sticky top-20 z-40 shadow-2xl shadow-black/40 ring-1 ring-white/5">
                    <div className="flex items-center gap-2 md:gap-4">
                         <button 
                            onClick={selectAll}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
                         >
                             {selectedIds.size === images.length ? <CheckSquare size={18} className="text-indigo-400" /> : <Square size={18} />}
                             <span className="hidden sm:inline">Select All</span>
                         </button>
                         <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />
                         <span className="text-indigo-400 font-bold text-sm px-2">
                            {selectedIds.size} <span className="text-slate-500 font-medium">selected</span>
                         </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 ? (
                            <>
                                <button
                                    onClick={bulkDelete}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/30 rounded-xl text-sm font-bold transition-all"
                                >
                                    <Trash2 size={16} /> <span className="hidden xs:inline">Delete</span>
                                </button>
                                <button
                                    onClick={bulkDownload}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                                >
                                    <FileDown size={16} /> Download
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleDownloadAll}
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                            >
                                <FileDown size={18} />
                                Download Bundle
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                    {images.map(img => (
                        <ImageCard 
                            key={img.id} 
                            image={img} 
                            isSelected={selectedIds.has(img.id)}
                            onToggleSelect={toggleSelection}
                            onRename={handleRename}
                            onRegenerateName={handleRegenerateName}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            </div>

            <div className="lg:col-span-5 xl:col-span-4 lg:relative">
                <div className="lg:sticky lg:top-24 space-y-6">
                    <div className="bg-slate-900/40 backdrop-blur-sm rounded-3xl border border-slate-800/80 p-6 md:p-8 shadow-2xl ring-1 ring-white/5 overflow-hidden">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-teal-500/10 rounded-2xl ring-1 ring-teal-500/20">
                                    <FileText className="text-teal-400" size={24} />
                                </div>
                                {/** Header text for the README section */}
                                <div>
                                    <h2 className="text-xl font-bold text-white leading-tight">Project README</h2>
                                    <p className="text-xs text-slate-500 font-medium uppercase tracking-tighter">AI Generation</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowSettings(!showSettings)}
                                className={`p-2.5 rounded-xl transition-all ${showSettings ? 'bg-slate-700 text-white shadow-inner' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
                            >
                                <Settings2 size={22} />
                            </button>
                        </div>

                        {showSettings && (
                            <div className="mb-8 p-5 bg-slate-950/50 rounded-2xl border border-slate-800 space-y-5 animate-in slide-in-from-top-4 duration-300">
                                 <div>
                                     <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Writing Style</label>
                                     <div className="grid grid-cols-2 gap-2">
                                         {(['professional', 'tutorial', 'marketing', 'minimalist'] as ReadmeTone[]).map(t => (
                                             <button
                                                key={t}
                                                onClick={() => setSettings(s => ({ ...s, tone: t }))}
                                                className={`
                                                    px-3 py-2 text-xs font-bold rounded-xl border capitalize transition-all
                                                    ${settings.tone === t 
                                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 scale-105 z-10' 
                                                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}
                                                `}
                                             >
                                                 {t}
                                             </button>
                                         ))}
                                     </div>
                                 </div>
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Project Context</label>
                                    <textarea 
                                        value={settings.context}
                                        onChange={(e) => setSettings(s => ({ ...s, context: e.target.value }))}
                                        placeholder="Add custom details to include..."
                                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 h-24 resize-none transition-all"
                                    />
                                 </div>
                            </div>
                        )}

                        {!readme ? (
                            <div className="space-y-6">
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    Our AI will scan the extracted text and automatically embed your named images into a professional structure.
                                </p>
                                <button 
                                    onClick={handleGenerateReadme}
                                    disabled={isGeneratingReadme || status === ProcessingStatus.ANALYZING}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-500/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-[0.98]"
                                >
                                    {isGeneratingReadme ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Analyzing Document...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={20} />
                                            Generate Full README
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                                    <button 
                                        onClick={() => setReadmeView('preview')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${readmeView === 'preview' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
                                    >
                                        PREVIEW
                                    </button>
                                    <button 
                                        onClick={() => setReadmeView('edit')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${readmeView === 'edit' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
                                    >
                                        MARKDOWN
                                    </button>
                                </div>
                                
                                <div className="relative group rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
                                    {readmeView === 'edit' ? (
                                        <textarea 
                                            value={readme}
                                            onChange={(e) => setReadme(e.target.value)}
                                            className="w-full h-[60vh] lg:h-[70vh] bg-slate-950 text-indigo-300 text-sm font-mono p-5 outline-none resize-none custom-scrollbar selection:bg-indigo-500/40"
                                        />
                                    ) : (
                                        <div className="h-[60vh] lg:h-[70vh]">
                                          <ReadmePreview markdown={readme} images={images} />
                                        </div>
                                    )}

                                    <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-50">
                                        <button
                                            onClick={handleCopyReadme}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/90 backdrop-blur hover:bg-slate-700 text-white rounded-xl shadow-2xl border border-slate-700 transition-all active:scale-95"
                                        >
                                            {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                                            <span className="text-xs font-bold">{copied ? 'COPIED!' : 'COPY'}</span>
                                        </button>
                                        <button
                                            onClick={handleGenerateReadme}
                                            className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-2xl transition-all active:scale-95"
                                            title="Regenerate"
                                        >
                                            <Loader2 size={18} className={isGeneratingReadme ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}
      </main>

       <footer className="border-t border-slate-800/50 py-10 mt-20 bg-slate-900/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-6 mb-6">
                <a href="#" className="text-slate-500 hover:text-slate-300 transition-colors">Documentation</a>
                <a href="#" className="text-slate-500 hover:text-slate-300 transition-colors">Privacy</a>
                <a href="#" className="text-slate-500 hover:text-slate-300 transition-colors">Terms</a>
            </div>
            <p className="text-slate-600 text-[11px] font-bold uppercase tracking-[0.2em]">
               &copy; {new Date().getFullYear()} Image Intelligence Engine. Native processing.
            </p>
        </div>
       </footer>
    </div>
  );
};

export default App;
