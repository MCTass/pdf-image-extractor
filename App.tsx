import React, { useState, useEffect, useMemo } from "react";
import Dropzone from "./components/Dropzone";
import ImageCard from "./components/ImageCard";
import ReadmePreview from "./components/ReadmePreview";
import {
  ExtractedImage,
  ProcessingStatus,
  ReadmeSettings,
  ReadmeTone,
  AiProvider
} from "./types";
import { processPdf } from "./services/pdfService";
import { florenceService, ModelProgress, OfflineModelType } from "./services/florenceService";
import { qwenService, QwenProgress } from "./services/qwenService";
import { gemmaService, GemmaProgress } from "./services/gemmaService";
import { ollamaService } from "./services/ollamaService";
import {
  openrouterService,
  OPENROUTER_FREE_MODELS,
  getStoredOpenRouterKey,
  setStoredOpenRouterKey,
  getStoredOpenRouterModel,
  setStoredOpenRouterModel
} from "./services/openrouterService";
import { createZip, downloadBlob } from "./utils/fileUtils";
import {
  FileText,
  FileDown,
  Loader2,
  Info,
  Github,
  Copy,
  Check,
  Settings2,
  Trash2,
  CheckSquare,
  Square,
  Plus,
  Key,
  Sparkles,
  Layers,
  Cpu,
  Server,
  CloudLightning,
  Eye,
  EyeOff,
  ExternalLink,
  BookOpen,
  RefreshCw,
  FolderArchive
} from "lucide-react";

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchNaming, setIsBatchNaming] = useState(false);
  const [pdfText, setPdfText] = useState<string>("");
  const [readme, setReadme] = useState<string>("");
  const [isGeneratingReadme, setIsGeneratingReadme] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [readmeView, setReadmeView] = useState<"preview" | "edit">("preview");
  const [currentFileName, setCurrentFileName] = useState<string>("");

  // AI Provider & Settings
  const [aiProvider, setAiProvider] = useState<AiProvider>("openrouter");
  const [openRouterKey, setOpenRouterKey] = useState<string>(getStoredOpenRouterKey());
  const [openRouterModel, setOpenRouterModel] = useState<string>(getStoredOpenRouterModel());
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>("");

  // Offline Browser Model Settings
  const [offlineModel, setOfflineModel] = useState<OfflineModelType>("florence-2");
  const [modelProgress, setModelProgress] = useState<ModelProgress>(florenceService.getStatus());
  const [qwenStatus, setQwenStatus] = useState<QwenProgress>(qwenService.getStatus());
  const [gemmaStatus, setGemmaStatus] = useState<GemmaProgress>(gemmaService.getStatus());
  const [ollamaActive, setOllamaActive] = useState<boolean>(false);

  // README Generation Preferences
  const [settings, setSettings] = useState<ReadmeSettings>({
    tone: "professional",
    context: "",
  });
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Sync stored key & subscriptions
  useEffect(() => {
    const key = getStoredOpenRouterKey();
    if (key) setOpenRouterKey(key);

    const unsubscribeFlorence = florenceService.onStatusChange(setModelProgress);
    const unsubscribeQwen = qwenService.onStatusChange(setQwenStatus);
    const unsubscribeGemma = gemmaService.onStatusChange(setGemmaStatus);

    ollamaService.isRunning().then(setOllamaActive);

    return () => {
      unsubscribeFlorence();
      unsubscribeQwen();
      unsubscribeGemma();
    };
  }, []);

  const handleOpenApiKeyModal = () => {
    setTempApiKey(openRouterKey);
    setShowKeyModal(true);
  };

  const handleSaveApiKey = () => {
    const trimmed = tempApiKey.trim();
    setOpenRouterKey(trimmed);
    setStoredOpenRouterKey(trimmed);
    setShowKeyModal(false);
  };

  const handleModelChange = (modelId: string) => {
    setOpenRouterModel(modelId);
    setStoredOpenRouterModel(modelId);
  };

  const handleFileAccepted = async (file: File) => {
    setStatus(ProcessingStatus.EXTRACTING);
    setError(null);
    setImages([]);
    setPdfText("");
    setReadme("");
    setProgress(0);
    setSelectedIds(new Set());
    setCurrentFileName(file.name);

    try {
      const { images: extractedImages, text } = await processPdf(
        file,
        (current, total) => {
          setProgress(Math.round((current / total) * 100));
        }
      );

      setPdfText(text);

      if (extractedImages.length === 0) {
        setError("No images were found in this PDF, but text was successfully extracted. You can still generate a README!");
        setStatus(ProcessingStatus.IDLE);
        return;
      }

      const initialImages: ExtractedImage[] = extractedImages.map((img, idx) => ({
        id: `img-${Date.now()}-${idx}`,
        blob: img.blob,
        width: img.width,
        height: img.height,
        originalName: `figure-${img.pageIndex}-${idx + 1}`,
        suggestedName: `figure-${img.pageIndex}-${idx + 1}`,
        status: "pending",
        pageIndex: img.pageIndex,
      }));

      setImages(initialImages);
      setStatus(ProcessingStatus.ANALYZING);

      // Process vision naming
      await processImageNaming(initialImages);
      setStatus(ProcessingStatus.COMPLETE);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to parse PDF document.");
      setStatus(ProcessingStatus.ERROR);
    }
  };

  const processImageNaming = async (items: ExtractedImage[]) => {
    if (items.length === 0) return;

    // Mark all as analyzing
    setImages((prev) =>
      prev.map((p) => (items.some((i) => i.id === p.id) ? { ...p, status: "analyzing" } : p))
    );

    if (aiProvider === "openrouter") {
      if (!openRouterKey) {
        setImages((prev) =>
          prev.map((p) =>
            items.some((i) => i.id === p.id)
              ? {
                  ...p,
                  status: "done",
                  caption: `Extracted diagram from page ${p.pageIndex}`
                }
              : p
          )
        );
        setShowKeyModal(true);
        return;
      }

      try {
        const results = await openrouterService.batchSuggestImageNames(
          items,
          openRouterKey,
          openRouterModel
        );

        setImages((prev) =>
          prev.map((p) => {
            const found = results.find((r) => r.id === p.id);
            if (found) {
              return {
                ...p,
                suggestedName: found.filename,
                caption: found.caption,
                status: "done",
              };
            }
            return p;
          })
        );
      } catch (err: any) {
        console.error("OpenRouter batch vision naming error:", err);
        setError(`OpenRouter vision error: ${err.message}. Defaulting to standard figure names.`);
        setImages((prev) =>
          prev.map((p) => (items.some((i) => i.id === p.id) ? { ...p, status: "done" } : p))
        );
      }
    } else {
      // Local sequential naming
      for (const img of items) {
        try {
          let result: { filename: string; caption: string };
          if (aiProvider === "browser" && offlineModel === "gemma-4-e2b") {
            result = await gemmaService.suggestImageName(img.blob);
          } else {
            result = await florenceService.suggestImageName(img.blob);
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
                : p
            )
          );
        } catch (err) {
          setImages((prev) =>
            prev.map((p) => (p.id === img.id ? { ...p, status: "error" } : p))
          );
        }
      }
    }
  };

  const handleRegenerateName = async (id: string) => {
    const target = images.find((i) => i.id === id);
    if (!target) return;

    setImages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "analyzing" } : p))
    );

    if (aiProvider === "openrouter") {
      if (!openRouterKey) {
        setShowKeyModal(true);
        setImages((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "done" } : p))
        );
        return;
      }

      const results = await openrouterService.batchSuggestImageNames(
        [target],
        openRouterKey,
        openRouterModel
      );

      const found = results.find((r) => r.id === id);
      if (found) {
        setImages((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, suggestedName: found.filename, caption: found.caption, status: "done" }
              : p
          )
        );
      }
    } else {
      let result: { filename: string; caption: string };
      if (aiProvider === "browser" && offlineModel === "gemma-4-e2b") {
        result = await gemmaService.suggestImageName(target.blob);
      } else {
        result = await florenceService.suggestImageName(target.blob);
      }

      setImages((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, suggestedName: result.filename, caption: result.caption, status: "done" }
            : p
        )
      );
    }
  };

  const handleRename = (id: string, newName: string) => {
    setImages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, suggestedName: newName } : p))
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
      setSelectedIds(new Set(images.map((i) => i.id)));
    }
  };

  const bulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} selected images?`)) return;
    setImages((prev) => prev.filter((img) => !selectedIds.has(img.id)));
    setSelectedIds(new Set());
  };

  const bulkDownloadImages = async () => {
    const targetImages = selectedIds.size > 0 
      ? images.filter((img) => selectedIds.has(img.id))
      : images;

    if (targetImages.length === 0) return;
    try {
      const zipBlob = await createZip(targetImages);
      downloadBlob(zipBlob, "images.zip");
    } catch (e) {
      console.error(e);
      alert("Failed to build images ZIP.");
    }
  };

  const handleBatchRename = async () => {
    const targetImages = selectedIds.size > 0 
      ? images.filter((img) => selectedIds.has(img.id))
      : images;

    if (targetImages.length === 0) return;
    setIsBatchNaming(true);
    setError(null);
    await processImageNaming(targetImages);
    setIsBatchNaming(false);
  };

  const handleGenerateReadme = async () => {
    if (!pdfText) {
      setError("No PDF text available. Please upload a PDF file first.");
      return;
    }

    setIsGeneratingReadme(true);
    setError(null);
    setReadmeView("preview");

    const imageMeta = images.map((i) => ({
      filename: i.suggestedName || i.originalName,
      caption: i.caption
    }));

    try {
      if (aiProvider === "openrouter") {
        if (!openRouterKey) {
          setShowKeyModal(true);
          setIsGeneratingReadme(false);
          return;
        }

        setReadme("# Generating README with OpenRouter AI...\n\nAnalyzing document structure...");
        let accumulated = "";
        const markdown = await openrouterService.generateReadme(
          pdfText,
          imageMeta,
          settings,
          openRouterKey,
          openRouterModel,
          (token) => {
            accumulated += token;
            setReadme(accumulated);
          }
        );
        setReadme(markdown);
      } else if (aiProvider === "ollama") {
        setReadme("# Connecting to Ollama...\n\nEnsure Ollama is running (`ollama serve`) with OLLAMA_ORIGINS='*'.");
        const markdown = await ollamaService.generateReadme(
          pdfText,
          imageMeta.map(i => i.filename),
          settings.tone,
          settings.context,
          (token) => {
            setReadme((prev) => (prev.startsWith("# Connecting") ? token : prev + token));
          }
        );
        setReadme(markdown);
      } else {
        // Browser offline
        if (offlineModel === "gemma-4-e2b") {
          if (!gemmaService.isReady()) {
            setReadme("# Initializing Gemma-4-E2B in browser...\n\nPlease wait, loading model weights...");
            await gemmaService.initialize();
          }
          let streamed = "";
          const markdown = await gemmaService.generateReadme(
            pdfText,
            imageMeta.map(i => i.filename),
            settings.tone,
            settings.context,
            (token) => {
              streamed += token;
              setReadme(streamed);
            }
          );
          setReadme(markdown);
        } else {
          if (!qwenService.isReady()) {
            setReadme("# Initializing Qwen in browser...\n\nPlease wait, loading model weights...");
            await qwenService.initialize();
          }
          let streamed = "";
          const markdown = await qwenService.generateReadme(
            pdfText,
            imageMeta.map(i => i.filename),
            settings.tone,
            settings.context,
            (token) => {
              streamed += token;
              setReadme(streamed);
            }
          );
          setReadme(markdown);
        }
      }
    } catch (err: any) {
      console.error(err);
      setReadme(`# README Generation Failed\n\n**Error:** ${err.message}`);
    }

    setIsGeneratingReadme(false);
  };

  const handleDownloadReadmeOnly = () => {
    if (!readme) return;
    const blob = new Blob([readme], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, "README.md");
  };

  const handleDownloadFullBundle = async () => {
    if (!readme && images.length === 0) return;
    try {
      const zipBlob = await createZip(images, readme);
      downloadBlob(zipBlob, "project-readme-bundle.zip");
    } catch (err) {
      console.error(err);
      alert("Failed to build full project bundle ZIP.");
    }
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
    setCurrentFileName("");
  };

  const wordCount = useMemo(() => {
    if (!pdfText) return 0;
    return pdfText.trim().split(/\s+/).length;
  }, [pdfText]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="bg-[#0f172a]/90 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 rounded-xl shadow-lg shadow-indigo-500/25 border border-indigo-400/20">
              <Sparkles className="text-white" size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base md:text-lg text-white tracking-tight leading-none">
                  PDF to README
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                  AI Studio
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Turn research papers & docs into GitHub READMEs
              </p>
            </div>
          </div>

          {/* Center / Right: Provider Switcher & Tools */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Provider Switcher */}
            <div className="bg-slate-900/90 p-1 rounded-xl border border-slate-800 flex items-center shadow-inner">
              <button
                onClick={() => setAiProvider("openrouter")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  aiProvider === "openrouter"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <CloudLightning size={14} />
                <span className="hidden sm:inline">OpenRouter</span>
                <span className="text-[10px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 rounded">Free</span>
              </button>

              <button
                onClick={() => setAiProvider("browser")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  aiProvider === "browser"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Cpu size={14} />
                <span className="hidden sm:inline">Browser</span>
                <span className="text-[10px] px-1 py-0.2 bg-indigo-400/20 text-indigo-200 rounded">Offline</span>
              </button>

              <button
                onClick={() => setAiProvider("ollama")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  aiProvider === "ollama"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Server size={14} />
                <span className="hidden sm:inline">Ollama</span>
              </button>
            </div>

            {/* Provider Settings Button */}
            {aiProvider === "openrouter" ? (
              <button
                onClick={handleOpenApiKeyModal}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                  openRouterKey
                    ? "bg-slate-900 border-slate-700/80 text-slate-300 hover:border-indigo-500/50"
                    : "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 animate-pulse"
                }`}
                title="Configure OpenRouter API Key & Model"
              >
                <Key size={14} className={openRouterKey ? "text-indigo-400" : "text-amber-400"} />
                <span className="hidden md:inline">{openRouterKey ? "API Key Set" : "Set Free Key"}</span>
              </button>
            ) : aiProvider === "browser" ? (
              <select
                value={offlineModel}
                onChange={(e) => {
                  const m = e.target.value as OfflineModelType;
                  setOfflineModel(m);
                  if (m !== "gemma-4-e2b") florenceService.setModel(m);
                }}
                className="bg-slate-900 border border-slate-700/80 text-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="florence-2">Florence-2 (Fast Vision)</option>
                <option value="granite">Granite Docling</option>
                <option value="smolvlm-500">SmolVLM 500M</option>
                <option value="gemma-4-e2b">Gemma 4 E2B</option>
              </select>
            ) : null}

            {images.length > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700/60 transition-colors"
                title="Upload another PDF"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">New PDF</span>
              </button>
            )}

            <a
              href="https://github.com/MCTass/pdf-image-extractor"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title="View on GitHub"
            >
              <Github size={18} />
            </a>
          </div>
        </div>
      </header>

      {/* Model Progress Status Bar */}
      {(modelProgress.status === "loading" || qwenStatus.status === "loading" || gemmaStatus.status === "loading") && (
        <div className="bg-indigo-950/40 border-b border-indigo-800/40 px-4 py-2 text-xs flex items-center justify-between text-indigo-300 animate-pulse">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-indigo-400" />
            <span>Initializing browser model weights into memory...</span>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-8 flex flex-col">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800/60 rounded-2xl flex items-start gap-3 text-red-200">
            <Info size={18} className="shrink-0 mt-0.5 text-red-400" />
            <div className="text-xs leading-relaxed flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-xs font-bold">
              Dismiss
            </button>
          </div>
        )}

        {/* Empty State / Upload Dropzone */}
        {images.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-10 md:py-16">
            <div className="w-full max-w-3xl text-center space-y-4 mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-2">
                <Sparkles size={12} />
                <span>Turn any PDF paper or spec into a rich GitHub repository</span>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
                AI-Powered Documentation & Asset Extractor
              </h2>
              <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
                Extract high-resolution diagrams, name them with semantic Vision AI, and generate a production-ready, beautifully structured <code className="bg-slate-800 text-indigo-300 px-2 py-0.5 rounded text-sm">README.md</code>.
              </p>
            </div>

            <Dropzone onFileAccepted={handleFileAccepted} isProcessing={status === ProcessingStatus.EXTRACTING} />

            {status === ProcessingStatus.EXTRACTING && (
              <div className="mt-8 flex flex-col items-center gap-3">
                <div className="w-64 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/60">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs font-medium text-slate-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-indigo-400" />
                  Parsing pages & extracting figures ({progress}%)
                </p>
              </div>
            )}

            {/* Quick Feature Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-16 text-left">
              <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 transition-all">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 w-fit mb-3">
                  <Layers size={18} />
                </div>
                <h3 className="font-bold text-sm text-slate-100 mb-1">Dual-Engine Extraction</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Extracts both vector graphics and raster photos with PDF.js & PDF-lib for crystal-clear assets.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 transition-all">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit mb-3">
                  <Sparkles size={18} />
                </div>
                <h3 className="font-bold text-sm text-slate-100 mb-1">Vision AI Kebab-Case Naming</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Automatically names diagrams (e.g. `system-architecture.png`) using free Gemma 4 or Florence-2.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 transition-all">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-3">
                  <BookOpen size={18} />
                </div>
                <h3 className="font-bold text-sm text-slate-100 mb-1">Production README.md</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Synthesizes structured documentation with embedded figure links ready for your repository.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Active Workspace */}
        {images.length > 0 && (
          <div className="space-y-6">
            {/* Overview Stats Bar */}
            <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">
                    {currentFileName || "Document Loaded"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 border-l border-slate-800 pl-4">
                  <span>📸 <strong>{images.length}</strong> figures</span>
                  <span>📝 <strong>{wordCount.toLocaleString()}</strong> words</span>
                  <span className="hidden sm:inline">
                    ⚡ Provider: <strong className="text-indigo-300 capitalize">{aiProvider}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadFullBundle}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                >
                  <FolderArchive size={14} />
                  <span>Download Full Bundle (.zip)</span>
                </button>
              </div>
            </div>

            {/* Split Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Visual Assets Gallery (7 Cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Images Toolbar */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between gap-3 sticky top-20 z-30 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={selectAll}
                      className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      {selectedIds.size === images.length ? (
                        <CheckSquare size={16} className="text-indigo-400" />
                      ) : (
                        <Square size={16} />
                      )}
                      <span>Select All</span>
                    </button>
                    {selectedIds.size > 0 && (
                      <span className="text-xs text-indigo-300 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                        {selectedIds.size} selected
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Batch AI Naming Button */}
                    <button
                      onClick={handleBatchRename}
                      disabled={isBatchNaming}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-50"
                      title={selectedIds.size > 0 ? "Batch name selected images using AI" : "Batch name all images using AI"}
                    >
                      {isBatchNaming ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Naming in Batch...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} className="text-amber-300" />
                          <span>{selectedIds.size > 0 ? `Auto-Name Selected (${selectedIds.size})` : `Auto-Name All (${images.length})`}</span>
                        </>
                      )}
                    </button>

                    {selectedIds.size > 0 ? (
                      <>
                        <button
                          onClick={bulkDelete}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/60 hover:bg-red-900 text-red-200 rounded-xl text-xs font-medium border border-red-800/60 transition-colors"
                        >
                          <Trash2 size={14} /> Delete ({selectedIds.size})
                        </button>
                        <button
                          onClick={bulkDownloadImages}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors"
                        >
                          <FileDown size={14} /> Download ({selectedIds.size})
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={bulkDownloadImages}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700/60 transition-colors"
                      >
                        <FileDown size={14} /> Download All (.zip)
                      </button>
                    )}
                  </div>
                </div>

                {/* Images Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* Right Column: AI README Studio (5 Cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-5 sticky top-20 backdrop-blur-md space-y-5">
                  {/* Studio Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        <FileText size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">README.md Studio</h3>
                        <p className="text-[11px] text-slate-400">
                          {aiProvider === "openrouter"
                            ? `Model: ${OPENROUTER_FREE_MODELS.find(m => m.id === openRouterModel)?.name || "Free"}`
                            : aiProvider === "browser"
                            ? "Offline Browser Engine"
                            : "Local Ollama Engine"}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                      className={`p-2 rounded-xl border transition-all ${
                        showSettingsDrawer
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                          : "bg-slate-800 border-slate-700/80 text-slate-400 hover:text-white"
                      }`}
                      title="Tone & Prompt Settings"
                    >
                      <Settings2 size={16} />
                    </button>
                  </div>

                  {/* Settings Drawer */}
                  {showSettingsDrawer && (
                    <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-4 animate-in slide-in-from-top-2">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Documentation Tone
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["professional", "tutorial", "marketing", "minimalist"] as ReadmeTone[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => setSettings((s) => ({ ...s, tone: t }))}
                              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border capitalize transition-all ${
                                settings.tone === t
                                  ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Custom Instructions / Focus
                        </label>
                        <textarea
                          value={settings.context}
                          onChange={(e) => setSettings((s) => ({ ...s, context: e.target.value }))}
                          placeholder="e.g. Focus on benchmark comparisons, installation with Docker, and highlight architecture..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 h-20 resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Generation Trigger */}
                  {!readme ? (
                    <div className="space-y-4 py-2">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Synthesize document text with extracted figure references (<code className="text-indigo-300">images/filename.png</code>) into a complete open-source README.
                      </p>

                      <button
                        onClick={handleGenerateReadme}
                        disabled={isGeneratingReadme}
                        className="w-full py-3 bg-gradient-to-r from-indigo-600 via-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
                      >
                        {isGeneratingReadme ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Synthesizing README with AI...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            <span>Generate README.md with AI</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* View & Action Toolbar */}
                      <div className="flex items-center justify-between gap-2 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setReadmeView("preview")}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                              readmeView === "preview"
                                ? "bg-slate-800 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            Rendered Preview
                          </button>
                          <button
                            onClick={() => setReadmeView("edit")}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                              readmeView === "edit"
                                ? "bg-slate-800 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            Raw Markdown
                          </button>
                        </div>

                        <div className="flex items-center gap-1 pr-1">
                          <button
                            onClick={handleGenerateReadme}
                            disabled={isGeneratingReadme}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Regenerate"
                          >
                            <RefreshCw size={14} className={isGeneratingReadme ? "animate-spin" : ""} />
                          </button>
                          <button
                            onClick={handleCopyReadme}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Copy Markdown"
                          >
                            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          </button>
                          <button
                            onClick={handleDownloadReadmeOnly}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Download README.md"
                          >
                            <FileDown size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Content Area */}
                      <div className="h-[520px] rounded-xl border border-slate-800/80 overflow-hidden bg-slate-950/70">
                        {readmeView === "edit" ? (
                          <textarea
                            value={readme}
                            onChange={(e) => setReadme(e.target.value)}
                            className="w-full h-full bg-transparent text-slate-300 text-xs font-mono p-4 outline-none resize-none custom-scrollbar"
                            placeholder="# Enter markdown here..."
                          />
                        ) : (
                          <ReadmePreview markdown={readme} images={images} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* OpenRouter API Key & Model Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <CloudLightning size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">OpenRouter Free Vision AI</h3>
                  <p className="text-xs text-slate-400">Configure free multi-image vision & LLM inference</p>
                </div>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  OpenRouter API Key
                </label>
                <div className="relative">
                  <input
                    type={showKeyText ? "text" : "password"}
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyText(!showKeyText)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showKeyText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                  <span>Saved locally in your browser storage.</span>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium underline"
                  >
                    <span>Get free key</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Free Vision & LLM Model
                </label>
                <div className="space-y-2">
                  {OPENROUTER_FREE_MODELS.map((m) => (
                    <label
                      key={m.id}
                      onClick={() => handleModelChange(m.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        openRouterModel === m.id
                          ? "bg-indigo-500/10 border-indigo-500/60 ring-1 ring-indigo-500/20"
                          : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="openrouter_model"
                        checked={openRouterModel === m.id}
                        onChange={() => handleModelChange(m.id)}
                        className="mt-1 text-indigo-600 focus:ring-0"
                      />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">{m.name}</span>
                          <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
                            {m.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{m.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 mt-16 bg-[#0a0e1a]/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-2">
          <p className="text-xs text-slate-500">
            PDF to README Generator &bull; Built with OpenRouter, Transformers.js (WebGPU), and React
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
