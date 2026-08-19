
export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

class OllamaService {
  private baseUrl = "http://localhost:11434/api";

  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/tags`);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async generateReadme(
    pdfText: string,
    imageFilenames: string[],
    tone: string,
    context: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    const toneMap: Record<string, string> = {
      professional: "formal and business-ready",
      tutorial: "educational and step-by-step",
      marketing: "persuasive and benefit-focused",
      minimalist: "concise and direct",
    };

    const prompt = `You are an expert technical writer. Create a well-structured GitHub README.md from the provided PDF text.
- Tone: ${toneMap[tone] || toneMap.professional}
- Additional context: ${context || "None"}
- The user has extracted images now located in images/ folder: ${imageFilenames.join(", ")}.
- Insert images using Markdown: ![description](images/filename.png) where relevant.

PDF Content:
${pdfText.slice(0, 50000)}

Return RAW MARKDOWN ONLY. No introductory text.`;

    try {
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3", // Default to llama3, user can change if needed
          prompt: prompt,
          stream: !!onToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      if (onToken && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line) as OllamaResponse;
              if (json.response) {
                fullText += json.response;
                onToken(json.response);
              }
            } catch (e) {
              console.warn("Failed to parse Ollama chunk", e);
            }
          }
        }
        return fullText;
      } else {
        const data = await response.json();
        return data.response;
      }
    } catch (e) {
      console.error("Ollama connection failed", e);
      throw new Error("Failed to connect to local Ollama. Ensure it is running and OLLAMA_ORIGINS=\"*\" is set.");
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tags`);
      const data = await response.json();
      return data.models.map((m: any) => m.name);
    } catch (e) {
      return [];
    }
  }
}

export const ollamaService = new OllamaService();
export default ollamaService;
