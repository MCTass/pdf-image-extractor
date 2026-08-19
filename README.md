<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PDF Image Extractor & Namer

Extract images from PDFs and auto-generate descriptive filenames using vision AI (Florence-2 ONNX).

## Features

- 🔍 **Dual-Engine PDF Extraction**: Uses PDF.js and PDF-lib for comprehensive image extraction
- 🤖 **AI-Powered Naming**: Auto-generates descriptive, kebab-case filenames for extracted images
- 🔒 **Local & Privacy-First**: In-browser analysis using the **Florence-2** vision foundation model (accelerated by WebGPU)
- 📦 **Batch Operations**: Select, delete, and download multiple images at once
- 📝 **README Generator**: Auto-generate project READMEs based on PDF content and images
- 💾 **ZIP Export**: Download all or selected images as a ZIP file

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the app:

   ```bash
   npm run dev
   ```

> **Note:** The offline AI models load directly in the browser. First load may take a moment as the model downloads and initializes (~230MB cached in browser).

---

## How It Works

The application runs vision foundation models locally in your browser using:

- **Transformers.js (v4)** for running ML models directly in the browser
- **WebGPU Acceleration** for near-instant inference on supported devices
- **Quantized ONNX models** for efficient loading and execution
- **Browser caching** for faster subsequent loads after first download

### Key Benefits:

- ✅ **100% Privacy**: Images never leave your computer
- ✅ **No API Keys**: Works without any subscriptions or external API keys
- ✅ **Unlimited Use**: No rate limits or quotas
- ✅ **Works Offline**: After initial model load, works without internet connection

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **PDF Processing**: PDF.js, PDF-lib
- **Local Vision AI**: Florence-2 / SmolVLM via `@huggingface/transformers` (Transformers.js v4)
- **Local Text LLM / Ollama**: Qwen / Ollama integration
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Utilities**: JSZip (ZIP creation), React Markdown (README preview)

## Project Structure

```
├── services/
│   ├── florenceService.ts    # Offline vision AI integration
│   ├── qwenService.ts        # Local README generation
│   ├── ollamaService.ts      # Local Ollama integration
│   └── pdfService.ts         # PDF extraction engine
├── components/
│   ├── Dropzone.tsx          # File upload component
│   ├── ImageCard.tsx         # Individual image display
│   └── ReadmePreview.tsx     # README markdown preview
├── utils/
│   └── fileUtils.ts          # ZIP and download utilities
├── types.ts                  # TypeScript type definitions
└── App.tsx                   # Main application component
```

## License

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](LICENSE) license.

**Non-Commercial Use Only**: This means you are free to share and adapt the material, but you may not use the material for commercial purposes. Any adaptations must be shared under the same license.

## Acknowledgments

- **Florence-2**: [onnx-community/Florence-2-base-ft](https://huggingface.co/onnx-community/Florence-2-base-ft)
- **Transformers.js**: [HuggingFace Transformers.js](https://huggingface.co/docs/transformers.js) for browser-based ML
