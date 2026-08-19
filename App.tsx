import React, { useState, useEffect } from "react";
import Dropzone from "./components/Dropzone";
import ImageCard from "./components/ImageCard";
import ReadmePreview from "./components/ReadmePreview";
import {
  ExtractedImage,
  ProcessingStatus,
  ReadmeSettings,
  ReadmeTone,
} from "./types";
import { processPdf } from "./services/pdfService";
import {
  suggestImageName,
  generateProjectReadme,
} from "./services/geminiService";
import { florenceService, ModelProgress, OfflineModelType } from "./services/florenceService";
import { qwenService, QwenProgress } from "./services/qwenService";
import { gemmaService, GemmaProgress } from "./services/gemmaService";
import { ollamaService } from "./services/ollamaService";
import { createZip, downloadBlob } from "./utils/fileUtils";
import {
  Images,
  FileDown,
  Loader2,
  Info,
  Github,
  FileText,
  Copy,
  Check,
  Settings2,
  Trash2,
  CheckSquare,
  Square,
  Wifi,
  WifiOff,
  Plus,
  FilePlus,
} from "lucide-react";

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pdfText, setPdfText] = useState<string>("");
  const [readme, setReadme] = useState<string>("");
  const [isGeneratingReadme, setIsGeneratingReadme] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [readmeView, setReadmeView] = useState<"edit" | "preview">("preview");

  // AI provider state: 'online' | 'browser' | 'ollama'
  const [aiMode, setAiMode] = useState<"online" | "browser" | "ollama">("online");
  
  const [modelProgress, setModelProgress] = useState<ModelProgress>(
    florenceService.getStatus()
  );
  const [offlineModel, setOfflineModel] = useState<OfflineModelType>(
    "gemma-4-e2b"
  );
  const [qwenStatus, setQwenStatus] = useState<QwenProgress>(qwenService.getStatus());
  const [gemmaStatus, setGemmaStatus] = useState<GemmaProgress>(gemmaService.getStatus());
  const [ollamaActive, setOllamaActive] = useState(false);

  // Readme Settings
  const [settings, setSettings] = useState<ReadmeSettings>({
    tone: "professional",
    context: "",
  });
  const [showSettings, setShowSettings] = useState(false);

  // Subscribe to model statuses
  useEffect(() => {
    const unsubscribe = florenceService.onStatusChange((progress) => {
      setModelProgress(progress);
    });
    const unsubscribeQwen = qwenService.onStatusChange((s) => {
      setQwenStatus(s);
    });
    const unsubscribeGemma = gemmaService.onStatusChange((s) => {
      setGemmaStatus(s);
    });
    
    // Check if Ollama is running
    ollamaService.isRunning().then(setOllamaActive);

    return () => { 
      unsubscribe(); 
      unsubscribeQwen(); 
      unsubscribeGemma(); 
    };
  }, []);

  const handleFileAccepted = async (file: File) => {
    setStatus(ProcessingStatus.EXTRACTING);
    setError(null);
    setImages([]);
    setPdfText("");
    setReadme("");
    setProgress(0);
    setSelectedIds(new Set());

    try {
      const { images: extractedImages, text } = await processPdf(
        file,
        (current, total) => {
          setProgress(Math.round((current / total) * 100));
        },
      );

      setPdfText(text);

      if (extractedImages.length === 0) {
        setError("No valid images found in this PDF.");
        setStatus(ProcessingStatus.IDLE);
        return;
      }

      const initialImages: ExtractedImage[] = extractedImages.map(
        (img, idx) => ({
          id: `img-${Date.now()}-${idx}`,
          blob: img.blob,
          width: img.width,
          height: img.height,
          originalName: `image-${idx + 1}`,
          suggestedName: `image-${idx + 1}`,
          status: "pending",
          pageIndex: img.pageIndex,
        }),
      );

      setImages(initialImages);
      setStatus(ProcessingStatus.ANALYZING);
      await processImagesQueue(initialImages);

      setStatus(ProcessingStatus.COMPLETE);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to process PDF.");
      setStatus(ProcessingStatus.ERROR);
    }
  };

  const processImagesQueue = async (items: ExtractedImage[]) => {
    // Reduced concurrency to avoid Rate Limit errors
    const CONCURRENCY = aiMode !== "online" ? 1 : 2; // Local modes process one at a time
    const queue = [...items];
    const chunks = [];

    while (queue.length > 0) {
      chunks.push(queue.splice(0, CONCURRENCY));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      await Promise.all(
        chunk.map(async (img) => {
          setImages((prev) =>
            prev.map((p) =>
              p.id === img.id ? { ...p, status: "analyzing" } : p,
            ),
          );

          let result: {filename: string, caption: string};
          if (aiMode === "browser" || aiMode === "ollama") {
            // Both local modes use local Vision (Florence-2/Granite)
            if (aiMode === "browser" && offlineModel === "gemma-4-e2b") {
               result = await gemmaService.suggestImageName(img.blob);
            } else {
               result = await florenceService.suggestImageName(img.blob);
            }
          } else {
            // Use Gemini for online analysis
            result = await suggestImageName(img.blob);
          }

          setImages((prev) =>
            prev.map((p) =>
              p.id === img.id
                ? {
                    ...p,
                    suggestedName: result.filename,
                    caption: result.caption,
                    status: "done",
                  }
                : p,
            ),
          );
        }),
      );

      // Add a delay between chunks to respect API rate limits (avoiding 429 errors)
      if (i < chunks.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, aiMode !== "online" ? 500 : 1500),
        );
      }
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      const newSelectedIds = new Set<string>();
      for (const img of images) {
        newSelectedIds.add(img.id);
      }
      setSelectedIds(newSelectedIds);
    }
  };

  const bulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} images?`)) return;
    setImages((prev) => prev.filter((img) => !selectedIds.has(img.id)));
    setSelectedIds(new Set());
  };

  const bulkDownload = async () => {
    const selectedImages = images.filter((img) => selectedIds.has(img.id));
    if (selectedImages.length === 0) return;
    try {
      const zipBlob = await createZip(selectedImages);
      downloadBlob(zipBlob, "selected-images.zip");
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegenerateName = async (id: string) => {
    const img = images.find((i) => i.id === id);
    if (!img) return;

    setImages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "analyzing" } : p)),
    );

    let result: {filename: string, caption: string};
    if (aiMode !== "online") {
      if (aiMode === "browser" && offlineModel === "gemma-4-e2b") {
        result = await gemmaService.suggestImageName(img.blob);
      } else {
        result = await florenceService.suggestImageName(img.blob);
      }
    } else {
      result = await suggestImageName(img.blob);
    }

    setImages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, suggestedName: result.filename, caption: result.caption, status: "done" } : p,
      ),
    );
  };

  const handleRename = (id: string, newName: string) => {
    setImages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, suggestedName: newName } : p)),
    );
  };

  const handleDelete = (id: string) => {
    setImages((prev) => prev.filter((p) => p.id !== id));
    if (selectedIds.has(id)) {
      const newSet = new Set(selectedIds);
      newSet.delete(id);
      setSelectedIds(newSet);
    }
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    try {
      const zipBlob = await createZip(images);
      downloadBlob(zipBlob, "extracted-images.zip");
    } catch (e) {
      console.error("Failed to create zip", e);
      alert("Failed to create zip file.");
    }
  };

  const handleGenerateReadme = async () => {
    if (!pdfText) return;
    setIsGeneratingReadme(true);
    const currentNames = images.map((i) => i.suggestedName);

    try {
      let markdown: string;
      if (aiMode === "ollama") {
        setReadme("# Connecting to Ollama...\n\nEnsure Ollama is running (`ollama serve`) and CORS is enabled.");
        markdown = await ollamaService.generateReadme(
          pdfText,
          currentNames,
          settings.tone,
          settings.context,
          (token) => {
            setReadme(prev => prev.startsWith("# Connecting") ? token : prev + token);
          }
        );
      } else if (aiMode === "browser") {
        if (offlineModel === "gemma-4-e2b") {
           // Use Gemma 4 E2B offline
           if (!gemmaService.isReady()) {
             setReadme("# Initializing Gemma-4-E2B...\n\nPlease wait, the offline model is loading.");
             await gemmaService.initialize();
           }
           let streamed = "";
           markdown = await gemmaService.generateReadme(
             pdfText,
             currentNames,
             settings.tone,
             settings.context,
             (token) => {
               streamed += token;
               setReadme(streamed);
             }
           );
        } else {
           // Use Qwen1.5/3.5 offline
           if (!qwenService.isReady()) {
             setReadme("# Initializing Qwen...\n\nPlease wait, the offline model is loading.");
             await qwenService.initialize();
           }
           let streamed = "";
           markdown = await qwenService.generateReadme(
             pdfText,
             currentNames,
             settings.tone,
             settings.context,
             (token) => {
               streamed += token;
               setReadme(streamed);
             }
           );
        }
      } else {
        markdown = await generateProjectReadme(pdfText, currentNames, settings);
      }
      setReadme(markdown);
    } catch (e: any) {
      setReadme(`# README Generation Failed\n\n${e.message}`);
    }

    setIsGeneratingReadme(false);
    setReadmeView("preview");
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
    setReadme("");
    setPdfText("");
    setSelectedIds(new Set());
    setSettings({ tone: "professional", context: "" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Model Loading/Error Banner Area */}
      <div className="flex flex-col">
        {/* Loading States */}
        {(modelProgress.status === "loading" || qwenStatus.status === "loading" || gemmaStatus.status === "loading") && (
          <div className="bg-blue-900/30 border-b border-blue-800 px-4 py-3 space-y-2">
            {modelProgress.status === "loading" && (
              <div className="max-w-7xl mx-auto flex items-center gap-3 text-blue-200">
                <Loader2 size={16} className="animate-spin shrink-0 text-blue-400" />
                <p className="text-sm font-medium">
                  {modelProgress.message || "Loading Vision model..."}
                </p>
                <span className="text-xs text-blue-300 ml-auto font-mono">
                  {modelProgress.progress ? `${modelProgress.progress}%` : "Initialising..."}
                </span>
              </div>
            )}
            {qwenStatus.status === "loading" && offlineModel !== "gemma-4-e2b" && (
              <div className="max-w-7xl mx-auto flex items-center gap-3 text-indigo-200 border-t border-blue-800/30 pt-2">
                <Loader2 size={16} className="animate-spin shrink-0 text-indigo-400" />
                <p className="text-sm font-medium">
                  {qwenStatus.message || "Loading Qwen Text model..."}
                </p>
                <span className="text-xs text-indigo-300 ml-auto font-mono">
                  {qwenStatus.progress ? `${qwenStatus.progress}%` : "Initialising..."}
                </span>
              </div>
            )}
            {gemmaStatus.status === "loading" && (
              <div className="max-w-7xl mx-auto flex items-center gap-3 text-emerald-200 border-t border-blue-800/30 pt-2">
                <Loader2 size={16} className="animate-spin shrink-0 text-emerald-400" />
                <p className="text-sm font-medium">
                  {gemmaStatus.message || "Loading Gemma model..."}
                </p>
                <span className="text-xs text-emerald-300 ml-auto font-mono">
                  {gemmaStatus.progress ? `${gemmaStatus.progress}%` : "Initialising..."}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error States */}
        {(modelProgress.status === "error" || qwenStatus.status === "error" || gemmaStatus.status === "error") && (
          <div className="bg-amber-900/30 border-b border-amber-800 px-4 py-3">
            <div className="max-w-7xl mx-auto flex items-center gap-3 text-amber-200">
              <Info size={18} className="shrink-0" />
              <div className="flex flex-col">
                <p className="text-sm font-medium">
                  {modelProgress.status === "error" ? `Vision Error: ${modelProgress.message}` :
                   gemmaStatus.status === "error" ? `Gemma Error: ${gemmaStatus.message}` :
                   `README Error: ${qwenStatus.message}`}
                </p>
                <p className="text-xs text-amber-300">
                  Online mode (Gemini AI) is still available.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg shadow-lg shadow-indigo-500/20">
              <Images className="text-white" size={20} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-100 leading-tight">
                PDF Image Extractor
              </h1>
              <p className="text-xs text-slate-400">
                {aiMode === "online" 
                  ? "Powered by Gemini AI" 
                  : aiMode === "ollama" 
                  ? "Local Server (Ollama)" 
                  : `Offline Browser (${offlineModel === "florence-2" ? "Florence-2" : offlineModel === "granite" ? "Granite" : "SmolVLM"})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* AI Mode Selector */}
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                <button 
                  onClick={() => setAiMode("online")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${aiMode === "online" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-300"}`}
                >
                  Online
                </button>
                <button 
                  onClick={() => setAiMode("browser")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${aiMode === "browser" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-300"}`}
                >
                  Browser
                </button>
                <button 
                  onClick={() => setAiMode("ollama")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${aiMode === "ollama" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-300"}`}
                >
                  Ollama
                </button>
            </div>

            {/* Offline Browser Model Selector */}
            {aiMode === "browser" && (
              <select
                value={offlineModel}
                onChange={(e) => {
                  const model = e.target.value as OfflineModelType;
                  setOfflineModel(model);
                  if (model !== "gemma-4-e2b") {
                    florenceService.setModel(model);
                  }
                }}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="florence-2">Florence-2 (Fast)</option>
                <option value="granite">Granite Docling (Smarter)</option>
                <option value="smolvlm-500">SmolVLM 500M (Instruct)</option>
                <option value="gemma-4-e2b">Gemma 4 E2B</option>
              </select>
            )}


            {images.length > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-all border border-slate-700"
              >
                <Plus size={16} />
                <span>New PDF</span>
              </button>
            )}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white"
            >
              <Github size={20} />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-3 text-red-200">
            <Info size={20} />
            <p>{error}</p>
          </div>
        )}

        {/* Empty State / Upload */}
        {images.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="w-full max-w-2xl mb-8 text-center space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400 pb-2">
                Turn PDF Images into Assets
              </h2>
              <p className="text-lg text-slate-400">
                Extracts images, auto-detects content, and renames them for your
                READMEs.
              </p>
            </div>

            <Dropzone
              onFileAccepted={handleFileAccepted}
              isProcessing={status === ProcessingStatus.EXTRACTING}
            />

            {status === ProcessingStatus.EXTRACTING && (
              <div className="mt-8 flex flex-col items-center gap-2 text-indigo-400">
                <Loader2 size={32} className="animate-spin" />
                <p className="text-sm font-medium">
                  Scanning PDF (Page {progress}%)
                </p>
              </div>
            )}
          </div>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Images */}
            <div className="lg:col-span-8 space-y-6">
              {/* Toolbar */}
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-3 flex flex-wrap items-center justify-between gap-4 sticky top-20 z-40 shadow-lg">
                <div className="flex items-center gap-4">
                  <button
                    onClick={selectAll}
                    className="flex items-center gap-2 text-sm text-slate-300 hover:text-white px-2"
                  >
                    {selectedIds.size === images.length ? (
                      <CheckSquare size={18} />
                    ) : (
                      <Square size={18} />
                    )}
                    Select All
                  </button>
                  <span className="text-slate-500 border-l border-slate-600 pl-4 text-sm">
                    {selectedIds.size} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 ? (
                    <>
                      <button
                        onClick={bulkDelete}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-200 rounded text-sm transition-colors"
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                      <button
                        onClick={bulkDownload}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm transition-colors"
                      >
                        <FileDown size={16} /> Download
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
                        title="Upload a new PDF"
                      >
                        <FilePlus size={18} />
                        New PDF
                      </button>
                      <button
                        onClick={handleDownloadAll}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition-colors"
                      >
                        <FileDown size={18} />
                        Download All (.zip)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((img) => (
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

            {/* Right Column: README Generator */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 sticky top-24">
                {/* Header with Settings Toggle */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-500/10 rounded-lg">
                      <FileText className="text-teal-400" size={24} />
                    </div>
                    <h2 className="text-xl font-semibold text-white">
                      Project README
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-2 rounded-lg transition-colors ${showSettings ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-700/50"}`}
                    title="Generation Settings"
                  >
                    <Settings2 size={20} />
                  </button>
                </div>

                {/* Settings Panel */}
                {showSettings && (
                  <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-4 animate-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        Tone
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            "professional",
                            "tutorial",
                            "marketing",
                            "minimalist",
                          ] as ReadmeTone[]
                        ).map((t) => (
                          <button
                            key={t}
                            onClick={() =>
                              setSettings((s) => ({ ...s, tone: t }))
                            }
                            className={`
                                                px-2 py-1.5 text-xs rounded border capitalize transition-colors
                                                ${
                                                  settings.tone === t
                                                    ? "bg-indigo-600 border-indigo-500 text-white"
                                                    : "bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500"
                                                }
                                            `}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        Additional Context
                      </label>
                      <textarea
                        value={settings.context}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            context: e.target.value,
                          }))
                        }
                        placeholder="e.g. Focus on the API integration..."
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 h-20 resize-none"
                      />
                    </div>
                  </div>
                )}

                {!readme ? (
                  <div className="space-y-4">
                    <p className="text-slate-400 text-sm">
                      Generate a GitHub-ready README based on the PDF text and
                      your named images.
                      {aiMode !== "online" && (
                        <span className="block mt-1 text-indigo-400 text-xs">
                          🧠 {aiMode === "ollama" ? "Ollama mode: using local server" : `Browser mode: using ${offlineModel === "gemma-4-e2b" ? "Gemma-4-E2B" : "Qwen"} locally`}
                        </span>
                      )}
                    </p>
                    {aiMode === "browser" && qwenStatus.status === "loading" && offlineModel !== "gemma-4-e2b" && (
                      <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-900/20 border border-blue-800 rounded-lg px-3 py-2">
                        <Loader2 size={14} className="animate-spin shrink-0" />
                        <span>{qwenStatus.message || "Loading Qwen..."} {qwenStatus.progress ? `${qwenStatus.progress}%` : ""}</span>
                      </div>
                    )}
                    {aiMode === "browser" && gemmaStatus.status === "loading" && offlineModel === "gemma-4-e2b" && (
                      <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
                        <Loader2 size={14} className="animate-spin shrink-0" />
                        <span>{gemmaStatus.message || "Loading Gemma..."} {gemmaStatus.progress ? `${gemmaStatus.progress}%` : ""}</span>
                      </div>
                    )}
                    <button
                      onClick={handleGenerateReadme}
                      disabled={
                        isGeneratingReadme ||
                        status === ProcessingStatus.ANALYZING ||
                        (aiMode === "browser" && offlineModel !== "gemma-4-e2b" && qwenStatus.status === "loading") ||
                        (aiMode === "browser" && offlineModel === "gemma-4-e2b" && gemmaStatus.status === "loading")
                      }
                      className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isGeneratingReadme ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          {aiMode !== "online" ? "Generating (Local)..." : "Writing..."}
                        </>
                      ) : (
                        <>
                          <FileText size={18} />
                          {aiMode !== "online" ? "Generate README (Local)" : "Generate README"}
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* View Toggle */}
                    <div className="flex bg-slate-900 p-1 rounded-lg">
                      <button
                        onClick={() => setReadmeView("preview")}
                        className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${readmeView === "preview" ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-300"}`}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => setReadmeView("edit")}
                        className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${readmeView === "edit" ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-300"}`}
                      >
                        Markdown
                      </button>
                    </div>

                    <div className="relative group">
                      {readmeView === "edit" ? (
                        <textarea
                          value={readme}
                          onChange={(e) => setReadme(e.target.value)}
                          className="w-full h-96 bg-slate-900 text-slate-300 text-sm font-mono p-4 rounded-lg border border-slate-700 focus:outline-none resize-none custom-scrollbar"
                        />
                      ) : (
                        <ReadmePreview markdown={readme} images={images} />
                      )}

                      <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={handleGenerateReadme}
                          className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md shadow-lg"
                          title="Regenerate"
                        >
                          <Loader2
                            size={16}
                            className={isGeneratingReadme ? "animate-spin" : ""}
                          />
                        </button>
                        <button
                          onClick={handleCopyReadme}
                          className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md shadow-lg"
                          title="Copy Markdown"
                        >
                          {copied ? (
                            <Check size={16} className="text-green-400" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 text-center">
                      Tip: Download images first to ensure 'images/' folder
                      structure matches.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 mt-12 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          <p>
            &copy; {new Date().getFullYear()} PDF Extractor. Supports both
            online (Gemini AI) and offline (Florence-2) modes.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
