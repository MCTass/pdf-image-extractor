

# PDF to README Generator (AI-Powered)

Turn PDF documents, technical papers, and project specs into production-ready GitHub READMEs and markdown documentation using AI — complete with automatically extracted images, diagrams, and smart filenames.

## 🚀 Overview

**PDF to README Generator** is designed specifically to convert PDF content into structured, well-formatted markdown READMEs with embedded visual assets:
1. 📄 **Document & Image Extraction**: Automatically extracts text, diagrams, screenshots, and figures from any PDF.
2. 🤖 **AI-Powered Image Naming**: Generates clean, semantic kebab-case filenames for all extracted assets using local vision AI.
3. 📝 **Intelligent README Synthesis**: Generates a complete project `README.md` tailored to your chosen tone and context, automatically embedding figures into the right sections.
4. 💾 **One-Click Export**: Live-preview your markdown, edit on the fly, and download assets packaged in a clean ZIP bundle.

## ✨ Features

- 📝 **AI README Generation**: Transforms raw PDF text and extracted figures into a polished, comprehensive `README.md`
- 🎨 **Custom Tone & Context**: Tailor README generation with custom prompts, extra context, and tones (Professional, Tutorial, Marketing, Minimalist)
- 👁️ **Live Markdown Preview**: Real-time side-by-side markdown renderer with instant copy and download options
- 🔍 **Dual-Engine PDF Extraction**: Uses PDF.js and PDF-lib for extraction of text and high-res images/diagrams
- 🌐 **OpenRouter Free Mode**: Zero-cost cloud vision & documentation synthesis using free multimodal models (e.g. `Gemma 4 31B`, `Nemotron Nano 12B VL`, `openrouter/free`)
- 🔒 **Browser Offline Mode**: 100% private, local in-browser vision analysis and generation (Florence-2 / SmolVLM / Gemma via WebGPU)
- 🖥️ **Ollama Local Server Mode**: Direct integration with your local Ollama server
- 📦 **Batch Operations & ZIP Export**: Select, manage, and download all extracted figures organized in an `images/` directory along with `README.md` in one bundle

## 🛠️ Run Locally

**Prerequisites:** Node.js (v18+)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the application:

   ```bash
   npm run dev
   ```

3. Open your browser at `http://localhost:5173`.

### Supported AI Providers:
- **OpenRouter (Free Cloud AI)**: Enter your free OpenRouter API key to access 262k-token vision & synthesis models at $0 cost.
- **Browser (100% Offline)**: Runs models directly in your browser using WebGPU and ONNX without internet or API keys.
- **Ollama (Local Server)**: Connects to your local `http://localhost:11434` instance.

---

## 💡 How It Works

1. **Upload & Parse**: Drop any PDF file. The dual extraction engine parses document text while recovering embedded vector and raster graphics.
2. **Vision Analysis**: Multimodal AI (Gemma 4 Free / Florence-2) analyzes all diagrams simultaneously and names them descriptively (e.g. `system-architecture-overview.png`).
3. **README Synthesis**: AI generates structured documentation following best open-source practices with properly embedded image links (`![figure](images/...)`).

---

## 💻 Tech Stack

- **Frontend**: React + TypeScript + Vite
- **PDF Processing**: PDF.js, PDF-lib
- **Cloud Free AI**: OpenRouter API (`google/gemma-4-31b-it:free`, `nvidia/nemotron-nano-12b-v2-vl:free`)
- **Local Vision AI**: Florence-2 / SmolVLM via `@huggingface/transformers` (Transformers.js v4 + WebGPU)
- **Local Text LLM & Server**: Qwen (in-browser) / Ollama integration
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Utilities**: JSZip (ZIP packaging), React Markdown (live preview)

## 📁 Project Structure

```
├── services/
│   ├── florenceService.ts    # In-browser vision AI naming (Florence-2 / SmolVLM)
│   ├── qwenService.ts        # In-browser README generation (Qwen ONNX)
│   ├── ollamaService.ts      # Local Ollama integration
│   └── pdfService.ts         # Dual-engine PDF extraction
├── components/
│   ├── Dropzone.tsx          # PDF upload zone
│   ├── ImageCard.tsx         # Extracted image card & filename editor
│   └── ReadmePreview.tsx     # Live README markdown preview & editor
├── utils/
│   └── fileUtils.ts          # ZIP packaging and download utilities
├── types.ts                  # TypeScript definitions
└── App.tsx                   # Main application layout & state
```

## 📄 License

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](LICENSE) license.

**Non-Commercial Use Only**: This means you are free to share and adapt the material, but you may not use the material for commercial purposes. Any adaptations must be shared under the same license.

## 🤝 Acknowledgments

- **Florence-2**: [onnx-community/Florence-2-base-ft](https://huggingface.co/onnx-community/Florence-2-base-ft)
- **Transformers.js**: [HuggingFace Transformers.js](https://huggingface.co/docs/transformers.js) for browser-based ML
