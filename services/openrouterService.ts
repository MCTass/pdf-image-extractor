import { ReadmeSettings } from '../types';

export interface OpenRouterModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  contextWindow: string;
}

export const OPENROUTER_FREE_MODELS: OpenRouterModelOption[] = [
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Gemma 4 31B (Recommended)',
    badge: 'Free • Vision',
    description: 'Google multimodal model with exceptional reasoning, chart and diagram analysis.',
    contextWindow: '262k tokens'
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Gemma 4 26B A4B (MoE)',
    badge: 'Free • Fast MoE',
    description: 'High-speed mixture-of-experts model optimized for fast batch image processing.',
    contextWindow: '262k tokens'
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    name: 'Nemotron Nano 12B VL',
    badge: 'Free • Technical',
    description: 'NVIDIA vision-language model with strong technical diagram and UI recognition.',
    contextWindow: '128k tokens'
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Router',
    badge: 'Free • Auto',
    description: 'Automatically routes to the best available free vision-capable model.',
    contextWindow: '200k tokens'
  }
];

const STORAGE_KEY_API_KEY = 'openrouter_api_key';
const STORAGE_KEY_MODEL = 'openrouter_model';

export const getStoredOpenRouterKey = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
};

export const setStoredOpenRouterKey = (key: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
};

export const getStoredOpenRouterModel = (): string => {
  if (typeof window === 'undefined') return OPENROUTER_FREE_MODELS[0].id;
  return localStorage.getItem(STORAGE_KEY_MODEL) || OPENROUTER_FREE_MODELS[0].id;
};

export const setStoredOpenRouterModel = (model: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_MODEL, model);
};

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ImageNamingResult {
  id: string;
  filename: string;
  caption: string;
}

export class OpenRouterService {
  private baseUrl = 'https://openrouter.ai/api/v1';

  async batchSuggestImageNames(
    items: { id: string; blob: Blob; pageIndex: number; originalName: string }[],
    apiKey: string,
    model: string = OPENROUTER_FREE_MODELS[0].id
  ): Promise<ImageNamingResult[]> {
    if (!apiKey) {
      throw new Error('OpenRouter API Key is missing. Please enter your free API key in settings.');
    }

    if (items.length === 0) return [];

    // Convert blobs to data URLs
    const base64List = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        pageIndex: item.pageIndex,
        originalName: item.originalName,
        base64: await blobToBase64(item.blob)
      }))
    );

    // Process in batches of up to 8 images per request
    const BATCH_SIZE = 8;
    const results: ImageNamingResult[] = [];

    for (let i = 0; i < base64List.length; i += BATCH_SIZE) {
      const chunk = base64List.slice(i, i + BATCH_SIZE);
      const chunkResults = await this.processChunk(chunk, apiKey, model);
      results.push(...chunkResults);
    }

    return results;
  }

  private async processChunk(
    chunk: { id: string; pageIndex: number; originalName: string; base64: string }[],
    apiKey: string,
    model: string
  ): Promise<ImageNamingResult[]> {
    const promptText = `You are an expert technical documentation assistant.
Analyze these ${chunk.length} extracted images/diagrams from a document.
For each image, provide:
1. "index": 0-based index (0 to ${chunk.length - 1}) corresponding to the order of images provided
2. "filename": a concise, descriptive kebab-case filename (e.g. system-architecture-overview, benchmark-comparison-chart, user-login-flow). DO NOT include file extension.
3. "caption": a precise 1-sentence technical caption describing what is depicted.

Return ONLY a valid JSON object matching this schema:
{
  "results": [
    { "index": 0, "filename": "descriptive-name-here", "caption": "1-sentence description" }
  ]
}`;

    const content: any[] = [{ type: 'text', text: promptText }];

    chunk.forEach((img) => {
      content.push({
        type: 'image_url',
        image_url: {
          url: img.base64
        }
      });
    });

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
          'X-Title': 'PDF to README Generator'
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `OpenRouter error (${response.status}): ${response.statusText}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '{}';
      
      const cleanJson = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        console.warn('Failed to parse JSON response directly, attempting regex extraction', e);
        const match = cleanJson.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error('Malformed JSON output from model');
        }
      }

      const list: any[] = Array.isArray(parsed?.results) ? parsed.results : (Array.isArray(parsed) ? parsed : []);

      return chunk.map((item, idx) => {
        const found = list.find((r: any) => r.index === idx) || list[idx];
        const rawName = found?.filename || `image-page-${item.pageIndex}-${idx + 1}`;
        const cleanName = rawName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || `figure-${item.pageIndex}-${idx + 1}`;

        return {
          id: item.id,
          filename: cleanName,
          caption: found?.caption || `Figure from page ${item.pageIndex}`
        };
      });
    } catch (err: any) {
      console.error('OpenRouter batch image naming error:', err);
      return chunk.map((item, idx) => ({
        id: item.id,
        filename: `extracted-image-p${item.pageIndex}-${idx + 1}`,
        caption: `Extracted image from page ${item.pageIndex}`
      }));
    }
  }

  async generateReadme(
    pdfText: string,
    imageFilenames: { filename: string; caption?: string }[],
    settings: ReadmeSettings,
    apiKey: string,
    model: string = OPENROUTER_FREE_MODELS[0].id,
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!apiKey) {
      throw new Error('OpenRouter API Key is missing. Please enter your free API key in settings.');
    }

    const toneDescriptions: Record<string, string> = {
      professional: 'polished, authoritative, comprehensive, and enterprise-grade',
      tutorial: 'educational, step-by-step, welcoming with walkthrough instructions',
      marketing: 'persuasive, punchy, benefit-focused with feature highlights',
      minimalist: 'concise, clean, bulleted, and strictly necessary details'
    };

    const imageReferenceList = imageFilenames
      .map((img) => `- \`images/${img.filename}.png\`: ${img.caption || 'Extracted document visual/diagram'}`)
      .join('\n');

    const systemPrompt = `You are a staff-level technical writer and developer advocate.
Your mission is to produce a world-class, production-ready GitHub README.md based on the provided PDF document text and its extracted image assets.

Guidelines:
- Tone: ${toneDescriptions[settings.tone] || toneDescriptions.professional}.
- Additional user context: ${settings.context || 'None provided'}.
- Available extracted images (located in images/ folder):
${imageReferenceList || 'No images extracted'}

README Structure Requirements:
1. Title and a compelling subtitle/summary.
2. Badges / Key Highlights.
3. Overview & Problem Solved.
4. Architecture & Key Concepts (embed architecture/system diagrams from images/ where appropriate: ![caption](images/filename.png)).
5. Features & Capabilities.
6. Getting Started / Quickstart / Installation instructions.
7. Usage Examples with syntax-highlighted code blocks.
8. Benchmarks / Results / Evaluation (embed relevant charts/tables from images/).
9. License & Contributing guidelines.

Important rules:
- Return ONLY the raw Markdown content. Do NOT wrap output in triple backtick markdown blocks (\`\`\`markdown ... \`\`\`).
- Embed relevant images with correct markdown syntax: ![Description](images/filename.png).
- Ensure realistic, high-quality technical accuracy derived from the document text.`;

    const userPrompt = `Here is the extracted text from the PDF document:

${pdfText.slice(0, 75000)}

Please generate the complete, comprehensive README.md now. Start directly with the top header.`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
        'X-Title': 'PDF to README Generator'
      },
      body: JSON.stringify({
        model,
        stream: !!onToken,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `OpenRouter error (${response.status}): ${response.statusText}`);
    }

    if (onToken && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const token = data.choices?.[0]?.delta?.content || '';
              if (token) {
                fullText += token;
                onToken(token);
              }
            } catch (e) {
              // Ignore partial parse
            }
          }
        }
      }

      return fullText;
    } else {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }
}

export const openrouterService = new OpenRouterService();
export default openrouterService;
