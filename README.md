<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PDF Image Extractor & Namer

Extract images from PDFs and auto-generate descriptive filenames using AI. Supports both **online mode** (Gemini AI) and **offline mode** (Florence-2 ONNX).

## Features

- 🔍 **Dual-Engine PDF Extraction**: Uses PDF.js and PDF-lib for comprehensive image extraction
- 🤖 **AI-Powered Naming**: Auto-generates descriptive, kebab-case filenames for extracted images
- 🌐 **Online Mode**: Cloud-based analysis using Gemini AI for high-quality descriptions
- 🔒 **Offline Mode**: Local, privacy-first analysis using the **Florence-2** vision foundation model (accelerated by WebGPU)
- 📦 **Batch Operations**: Select, delete, and download multiple images at once
- 📝 **README Generator**: Auto-generate project READMEs based on PDF content and images
- 💾 **ZIP Export**: Download all or selected images as a ZIP file

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure your preferred mode:

   **Option A: Online Mode (Gemini AI)**
   - Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key
   - Get your API key from [Google AI Studio](https://aistudio.google.com/)

   **Option B: Offline Mode (No API Key Required)**
   - Simply skip the API key setup
   - The Florence-2 model will load automatically in the browser
   - First load may take a moment as the model downloads and initializes (~230MB cached in browser)

3. Run the app:
   ```bash
   npm run dev
   ```

The offline mode uses the **Florence-2 (base-ft)** vision foundation model, optimized for web browsers using:

- **Transformers.js (v4)** for running ML models directly in the browser
- **WebGPU Acceleration** for near-instant inference on supported devices
- **Quantized ONNX model** (~230MB) for efficient loading and execution
- **Browser caching** for faster subsequent loads after first download

### Benefits of Offline Mode:

- ✅ **Privacy**: Images never leave your computer
- ✅ **No API Keys**: Works without any subscriptions
- ✅ **Unlimited Use**: No rate limits or quotas
- ✅ **Works Offline**: After initial model load, works without internet

### Trade-offs:

- 🔄 First load takes time (model download & caching)
- 📝 Captions are simpler than cloud-based Gemini (basic descriptions like "a person in a room")
- ⚡ Slightly slower per-image analysis
- 🎯 Best for simple, generic image naming rather than detailed understanding

## Usage Tips

1. **Switching Modes**: Use the Online/Offline toggle in the header
2. **Model Loading**: A blue banner appears while the offline model loads
3. **Best Quality**: For professional/production use, online mode (Gemini) provides more detailed captions
4. **Quick Processing**: Offline mode processes images one at a time for stability

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **PDF Processing**: PDF.js, PDF-lib
- **Online AI**: Google Gemini AI via `@google/genai`
- **Offline AI**: Florence-2 via `@huggingface/transformers` (Transformers.js v4)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Utilities**: JSZip (ZIP creation), React Markdown (README preview)

## Project Structure

```
├── services/
│   ├── geminiService.ts      # Online AI integration
│   ├── florenceService.ts    # Offline AI integration (NEW)
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
