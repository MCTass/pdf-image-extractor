import {
  Florence2ForConditionalGeneration,
  AutoModelForVision2Seq,
  AutoProcessor,
  RawImage,
  env,
} from "@huggingface/transformers";

// Configure transformers
env.allowLocalModels = false;
env.useBrowserCache = true;

export type OfflineModelType = "florence-2" | "smolvlm" | "smolvlm-500";

export type ModelProgress = {
  status: "loading" | "ready" | "error";
  progress?: number;
  message?: string;
  modelId?: string;
};

class OfflineAIService {
  private model: any = null;
  private processor: any = null;
  private modelStatus: ModelProgress = { status: "loading", progress: 0 };
  private statusListeners: Array<(status: ModelProgress) => void> = [];
  private initializationPromise: Promise<void> | null = null;

  private currentModelType: OfflineModelType = "florence-2";
  private readonly MODELS = {
    "florence-2": "onnx-community/Florence-2-base-ft",
    "smolvlm": "HuggingFaceTB/SmolVLM-256M-Instruct",
    "smolvlm-500": "HuggingFaceTB/SmolVLM-500M-Instruct",
  };

  constructor() {
    // Initial load with default model
    this.initializeModel();
  }

  /**
   * Change the active model and re-initialize
   */
  async setModel(modelType: OfflineModelType) {
    if (this.currentModelType === modelType && this.model) return;

    this.currentModelType = modelType;
    this.model = null; // Clear existing model
    this.processor = null;
    this.initializationPromise = null;
    await this.initializeModel();
  }

  getCurrentModelType(): OfflineModelType {
    return this.currentModelType;
  }

  onStatusChange(callback: (status: ModelProgress) => void) {
    this.statusListeners.push(callback);
    callback(this.modelStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyStatus() {
    this.statusListeners.forEach((callback) => callback(this.modelStatus));
  }

  getStatus(): ModelProgress {
    return { ...this.modelStatus };
  }

  isReady(): boolean {
    return this.modelStatus.status === "ready";
  }

  private async initializeModel() {
    if (this.initializationPromise) return this.initializationPromise;

    const modelId = this.MODELS[this.currentModelType];
    const modelNameDisplay = this.currentModelType === "florence-2" ? "Florence-2" : (this.currentModelType === "smolvlm-500" ? "SmolVLM-500M" : "SmolVLM-256M");

    this.initializationPromise = (async () => {
      try {
        this.modelStatus = {
          status: "loading",
          progress: 0,
          message: `Initializing ${modelNameDisplay}...`,
          modelId
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
            console.warn("[OfflineAIService] WebGPU not available, falling back to WASM");
          }
        }

        console.log(`[OfflineAIService] Model: ${modelId}, Device: ${device}, fp16: ${supportsFp16}`);

        // Load processor
        this.processor = (await AutoProcessor.from_pretrained(modelId, {
          progress_callback: (p: any) => {
            if (p.status === "progress") {
              this.modelStatus = {
                status: "loading",
                progress: Math.round(p.progress),
                message: `Downloading ${modelNameDisplay}: ${Math.round(p.progress)}%`,
                modelId
              };
              this.notifyStatus();
            }
          },
        })) as AutoProcessor;

        // Load model based on type
        const modelOptions: any = {
          device: device as any,
          progress_callback: (p: any) => {
            if (p.status === "progress") {
              this.modelStatus = {
                status: "loading",
                progress: Math.round(p.progress),
                message: `Loading weights: ${Math.round(p.progress)}%`,
                modelId
              };
              this.notifyStatus();
            }
          },
        };

        if (this.currentModelType === "florence-2") {
          modelOptions.dtype = {
            embed_tokens: supportsFp16 ? "fp16" : "fp32",
            vision_encoder: supportsFp16 ? "fp16" : "fp32",
            encoder_model: "q4",
            decoder_model_merged: "q4",
          };
          this.model = await Florence2ForConditionalGeneration.from_pretrained(modelId, modelOptions);
        } else {
          // SmolVLM optimizations
          modelOptions.dtype = supportsFp16 ? "fp16" : "fp32";
          this.model = await AutoModelForVision2Seq.from_pretrained(modelId, modelOptions);
        }

        this.modelStatus = {
          status: "ready",
          progress: 100,
          message: `Ready (${device})`,
          modelId
        };
        this.notifyStatus();
        console.log(`[OfflineAIService] ${modelNameDisplay} loaded successfully`);
      } catch (error) {
        console.error(`[OfflineAIService] Failed to load ${modelNameDisplay}:`, error);
        this.modelStatus = {
          status: "error",
          message: `Load failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          modelId
        };
        this.notifyStatus();
      }
    })();

    return this.initializationPromise;
  }

  async suggestImageName(imageBlob: Blob): Promise<{filename: string, caption: string}> {
    if (!this.model || !this.processor) await this.initializeModel();
    if (!this.model || !this.processor || this.modelStatus.status !== "ready") throw new Error("Model not ready");

    try {
      const image = await RawImage.fromBlob(imageBlob);
      let caption = "";

      if (this.currentModelType === "florence-2") {
        const task = "<CAPTION>";
        const prompts = this.processor.construct_prompts(task);
        const inputs = await this.processor(image, prompts);
        const generated_ids = await this.model.generate({ ...inputs, max_new_tokens: 256 });
        const generated_text = this.processor.batch_decode(generated_ids, { skip_special_tokens: false })[0];
        const result = this.processor.post_process_generation(generated_text, task, image.size);
        caption = result[task] || "untitled";
      } else {
        // SmolVLM logic
        const promptText = "Describe this image with a detailed 1-2 sentence caption for metadata.";
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
        
        // Use regex to robustly find the start of the assistant's response, ignoring special tokens
        const match = generated_text.match(/<\|im_start\|>assistant|<end_of_utterance>| assistant\s*\n/i);
        if (match && match.index !== undefined) {
          caption = generated_text.slice(match.index + match[0].length).replace(/<\|endoftext\|>|<\|im_end\|>|<end_of_utterance>/g, "").trim();
        } else {
          // Fallback if special tokens are missing
          caption = generated_text.split(/assistant/i)?.pop()?.trim() || generated_text;
        }
      }

      return {
        filename: this.captionToFilename(caption),
        caption: caption
      };
    } catch (error) {
      console.error("[OfflineAIService] Analysis failed:", error);
      return { filename: `image-${Date.now()}`, caption: "Analysis failed" };
    }
  }

  private captionToFilename(caption: string): string {
    // Keep it short for the filename (first ~5-6 words)
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

  async getDetailedCaption(imageBlob: Blob): Promise<string> {
    if (!this.model || !this.processor) await this.initializeModel();
    if (!this.model || !this.processor || this.modelStatus.status !== "ready") throw new Error("Model not ready");

    try {
      const image = await RawImage.fromBlob(imageBlob);
      if (this.currentModelType === "florence-2") {
        const task = "<DETAILED_CAPTION>";
        const prompts = this.processor.construct_prompts(task);
        const inputs = await this.processor(image, prompts);
        const generated_ids = await this.model.generate({ ...inputs, max_new_tokens: 256 });
        const generated_text = this.processor.batch_decode(generated_ids, { skip_special_tokens: false })[0];
        const result = this.processor.post_process_generation(generated_text, task, image.size);
        return result[task] || "No description available";
      } else {
        const messages = [
          {
            role: "user",
            content: [
              { type: "image" },
              { type: "text", text: "Describe this image in detail." },
            ],
          },
        ];
        const prompt = this.processor.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
        const inputs = await this.processor(prompt, [image]);
        const generated_ids = await this.model.generate({ ...inputs, max_new_tokens: 256 });
        const generated_text = this.processor.batch_decode(generated_ids, { skip_special_tokens: true })[0];
        return generated_text.split("assistant")?.pop()?.trim() || generated_text;
      }
    } catch (error) {
      console.error("[OfflineAIService] Detailed caption failed:", error);
      return "Failed to generate description";
    }
  }
}

// Keep the export name the same for compatibility with App.tsx
export const florenceService = new OfflineAIService();
export default florenceService;

