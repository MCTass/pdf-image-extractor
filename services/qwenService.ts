import { AutoTokenizer, AutoModelForCausalLM, env, TextStreamer } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";

export type QwenProgress = {
  status: "idle" | "loading" | "ready" | "error" | "generating";
  progress?: number;
  message?: string;
};

class QwenService {
  private model: any = null;
  private tokenizer: any = null;
  private status: QwenProgress = { status: "idle" };
  private listeners: Array<(s: QwenProgress) => void> = [];
  private initPromise: Promise<void> | null = null;

  onStatusChange(cb: (s: QwenProgress) => void) {
    this.listeners.push(cb);
    cb(this.status);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  getStatus(): QwenProgress {
    return { ...this.status };
  }

  private notify(s: QwenProgress) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  async initialize() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        // Force WASM (CPU) — Qwen shares GPU with vision model causing device-lost errors
        this.notify({ status: "loading", progress: 0, message: "Initializing Qwen1.5-0.5B (CPU)..." });

        console.log("[QwenService] Initializing Qwen1.5-0.5B on WASM/CPU (dtype: q8)...");
        
        console.log("[QwenService] Loading tokenizer...");
        this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
          progress_callback: (p: any) => {
            if (p.status === "progress") {
              this.notify({ status: "loading", progress: Math.round(p.progress), message: `Tokenizer: ${Math.round(p.progress)}%` });
            }
          },
        });

        console.log("[QwenService] Loading model into memory (this may take 10-20 seconds)...");
        this.model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
          device: "wasm",
          dtype: "q8",
          progress_callback: (p: any) => {
            if (p.status === "progress") {
              this.notify({ status: "loading", progress: Math.round(p.progress), message: `Model weights: ${Math.round(p.progress)}%` });
            }
          },
        });

        this.notify({ status: "ready", progress: 100, message: "Ready (CPU)" });
        console.log("[QwenService] Qwen1.5-0.5B loaded on WASM/CPU");
      } catch (err) {
        console.error("[QwenService] Failed to load model:", err);
        this.notify({ status: "error", message: err instanceof Error ? err.message : "Load failed" });
        this.initPromise = null; // allow retry
      }
    })();
    return this.initPromise;
  }

  isReady() {
    return this.status.status === "ready";
  }

  /**
   * Generate a README markdown document from the extracted PDF text and image filenames.
   */
  async generateReadme(
    pdfText: string,
    imageFilenames: string[],
    tone: string,
    context: string,
    onToken?: (text: string) => void
  ): Promise<string> {
    if (!this.model) await this.initialize();
    if (!this.isReady()) throw new Error("Qwen model not ready");

    const toneMap: Record<string, string> = {
      professional: "formal, objective, and business-ready",
      tutorial: "educational, step-by-step, and friendly",
      marketing: "persuasive, exciting, and benefit-focused",
      minimalist: "concise, direct, and bullet-point heavy",
    };

    const truncated = pdfText.slice(0, 50000);
    const systemPrompt = `You are an expert technical writer. Create a well-structured GitHub README.md from the provided PDF text.
- Tone: ${toneMap[tone] || toneMap.professional}
- Additional context: ${context || "None"}
- The user has extracted images now located in images/ folder: ${imageFilenames.join(", ")}.
- Insert images using Markdown: ![description](images/filename.png) where relevant.
- Return RAW MARKDOWN ONLY. Do not use <thought> tags. Do not explain your reasoning. Do not add intro/outro text. Start directly with the # title.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Here is the PDF content:\n\n${truncated}\n\nGenerate the README.md now. Start directly with the content.` },
    ];

    const text = (this.tokenizer as any).apply_chat_template(messages, {
      tokenize: false,
      add_generation_prompt: true,
      enable_thinking: false, // Force model to skip the native reasoning/thinking state
    });
    const inputs = (this.tokenizer as any)(text, { return_tensors: "pt" });

    this.notify({ status: "generating", message: "Generating README..." });

    let generatedText = "";
    const streamer = onToken
      ? new TextStreamer(this.tokenizer, {
          skip_prompt: true,
          callback_function: (t: string) => {
            generatedText += t;
            onToken(t);
          },
        })
      : undefined;

    const output = await this.model.generate({
      ...inputs,
      max_new_tokens: 2048,
      do_sample: false,
      streamer,
      repetition_penalty: 1.1,
    });

    this.notify({ status: "ready", progress: 100, message: "Ready" });

    if (!onToken) {
      const decoded: string = this.tokenizer.batch_decode(output, { skip_special_tokens: true })[0];
      // Strip the echoed prompt from the output
      const assistantTag = decoded.lastIndexOf("assistant");
      return assistantTag !== -1 ? decoded.slice(assistantTag + "assistant".length).trim() : decoded.trim();
    }

    return generatedText.trim();
  }
}

export const qwenService = new QwenService();
export default qwenService;
