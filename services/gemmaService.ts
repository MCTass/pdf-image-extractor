import {
  AutoModelForCausalLM,
  AutoProcessor,
  RawImage,
  TextStreamer,
  env,
} from "@huggingface/transformers";

// Configure transformers
env.allowLocalModels = false;
env.useBrowserCache = true;

export type GemmaProgress = {
  status: "idle" | "loading" | "ready" | "error";
  progress?: number;
  message?: string;
};

class OfflineGemmaService {
  private model: any = null;
  private processor: any = null;
  private modelStatus: GemmaProgress = { status: "idle", progress: 0 };
  private statusListeners: Array<(status: GemmaProgress) => void> = [];
  private initializationPromise: Promise<void> | null = null;
  private readonly modelId = "onnx-community/gemma-4-E2B-it-ONNX";

  constructor() {}

  onStatusChange(callback: (status: GemmaProgress) => void) {
    this.statusListeners.push(callback);
    callback(this.modelStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyStatus() {
    this.statusListeners.forEach((callback) => callback(this.modelStatus));
  }

  getStatus(): GemmaProgress {
    return { ...this.modelStatus };
  }

  isReady(): boolean {
    return this.modelStatus.status === "ready";
  }

  async initialize() {
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      try {
        this.modelStatus = {
          status: "loading",
          progress: 0,
          message: "Initializing Gemma-4-E2B...",
        };
        this.notifyStatus();

        let device = "wasm";
        let supportsFp16 = false;
        if ("gpu" in navigator) {
          try {
            const adapter = await (navigator as any).gpu.requestAdapter();
            if (adapter) {
              device = "webgpu";
              supportsFp16 = adapter.features.has("shader-f16");
            }
          } catch (e) {
            console.warn("[OfflineGemmaService] WebGPU not available, falling back to WASM");
          }
        }

        console.log(`[OfflineGemmaService] Device: ${device}, fp16: ${supportsFp16}`);

        this.processor = await AutoProcessor.from_pretrained(this.modelId, {
          progress_callback: (p: any) => {
            if (p.status === "progress") {
              this.modelStatus = {
                status: "loading",
                progress: Math.round(p.progress),
                message: `Downloading Processor: ${Math.round(p.progress)}%`,
              };
              this.notifyStatus();
            }
          },
        });

        this.model = await AutoModelForCausalLM.from_pretrained(this.modelId, {
          device: device as any,
          dtype: "q4f16", // use a quantized version
          progress_callback: (p: any) => {
            if (p.status === "progress") {
              this.modelStatus = {
                status: "loading",
                progress: Math.round(p.progress),
                message: `Loading Gemma weights: ${Math.round(p.progress)}%`,
              };
              this.notifyStatus();
            }
          },
        });

        this.modelStatus = {
          status: "ready",
          progress: 100,
          message: `Ready (${device})`,
        };
        this.notifyStatus();
        console.log("[OfflineGemmaService] Gemma-4-E2B loaded successfully");
      } catch (error) {
        console.error("[OfflineGemmaService] Failed to load Gemma:", error);
        this.modelStatus = {
          status: "error",
          message: `Load failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
        this.notifyStatus();
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  async suggestImageName(imageBlob: Blob): Promise<{filename: string, caption: string}> {
    if (!this.model || !this.processor) await this.initialize();
    if (!this.model || !this.processor || this.modelStatus.status !== "ready") throw new Error("Gemma Model not ready");

    try {
      const image = await RawImage.fromBlob(imageBlob);
      const promptText = "Analyze this image and generate a concise, descriptive filename in kebab-case. Also generate a short 1-2 sentence caption describing the image. Return ONLY valid JSON format with keys 'filename' and 'caption'.";

      const messages = [
        {
          role: "user",
          content: [
            { type: "image" },
            { type: "text", text: promptText },
          ],
        },
      ];

      const prompt = this.processor.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
      const inputs = await this.processor(prompt, [image]);

      const generated_ids = await this.model.generate({ ...inputs, max_new_tokens: 128 });
      const generated_text = this.processor.batch_decode(generated_ids, { skip_special_tokens: false })[0];

      let responseText = "";
      const match = generated_text.match(/<start_of_turn>model\n([\s\S]*?)<end_of_turn>/);
      if (match) {
        responseText = match[1].trim();
      } else {
        responseText = generated_text.split(/model\n/i)?.pop()?.trim() || generated_text;
      }

      // Try to parse JSON
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.filename || parsed.caption) {
             return {
               filename: parsed.filename || this.captionToFilename(parsed.caption || "image"),
               caption: parsed.caption || "No caption provided"
             }
          }
        }
      } catch (e) {
        // Fallback if JSON parse fails
      }

      return {
        filename: this.captionToFilename(responseText),
        caption: responseText.slice(0, 200)
      };

    } catch (error) {
      console.error("[OfflineGemmaService] Image analysis failed:", error);
      return { filename: `image-${Date.now()}`, caption: "Analysis failed" };
    }
  }

  private captionToFilename(caption: string): string {
    const shortCaption = caption.split(/\s+/).slice(0, 6).join(" ");
    return (
      shortCaption
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "untitled-image"
    );
  }

  async generateReadme(
    pdfText: string,
    imageFilenames: string[],
    tone: string,
    context: string,
    onStream?: (chunk: string) => void
  ): Promise<string> {
    if (!this.model || !this.processor) await this.initialize();
    if (!this.model || !this.processor || this.modelStatus.status !== "ready") throw new Error("Gemma Model not ready");

    try {
      const toneDescriptions: Record<string, string> = {
        professional: "formal, objective, and business-ready",
        tutorial: "educational, step-by-step, and friendly",
        marketing: "persuasive, exciting, and benefit-focused",
        minimalist: "concise, direct, and bullet-point heavy",
      };

      const truncatedText = pdfText.slice(0, 5000);

      const systemPrompt = `You are an expert technical writer. Create a GitHub README.md based on the provided text extracted from a PDF.
Tone: ${toneDescriptions[tone] || tone}
Additional Context: ${context || "None"}
Available Images: ${imageFilenames.join(", ")}

Instructions:
1. Write a structured README (Title, Description, Features).
2. Insert images using Markdown: ![Alt Text](images/filename.png) where relevant.
3. Return ONLY the raw Markdown content.`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `PDF Text Content:\n${truncatedText}` },
      ];

      const prompt = this.processor.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
      const inputs = await this.processor(prompt);

      // We'll use a simpler generation without custom stopping criteria for now
      let generatedText = "";
      const streamer = onStream
        ? new TextStreamer(this.processor.tokenizer, {
            skip_prompt: true,
            callback_function: (t: string) => {
              generatedText += t;
              onStream(t);
            },
          })
        : undefined;

      const generated_ids = await this.model.generate({
          ...inputs,
          max_new_tokens: 1500,
          temperature: 0.7,
          streamer,
      });

      if (!onStream) {
         const generated_text = this.processor.batch_decode(generated_ids, { skip_special_tokens: true })[0];
         let markdown = generated_text;
         const sysEndIndex = generated_text.lastIndexOf("model\n");
         if (sysEndIndex !== -1) {
             markdown = generated_text.slice(sysEndIndex + "model\n".length).trim();
         }
         return markdown;
      }

      return generatedText.trim();
    } catch (error: any) {
      console.error("[OfflineGemmaService] README generation failed:", error);
      throw new Error("Failed to generate README with Gemma.");
    }
  }
}

export const gemmaService = new OfflineGemmaService();
export default gemmaService;
