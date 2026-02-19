import { GoogleGenAI, Type } from "@google/genai";
import { ReadmeSettings } from "../types";

// Initialize Gemini Client
const apiKey = process.env.API_KEY || '';

const getClient = () => new GoogleGenAI({ apiKey });

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Wrapper to handle 429 Quota Exceeded errors with exponential backoff
const callWithRetry = async <T>(
    fn: () => Promise<T>, 
    retries = 3, 
    delay = 2000
): Promise<T> => {
    try {
        return await fn();
    } catch (error: any) {
        const errStr = JSON.stringify(error);
        const isQuotaError = 
            error?.status === 429 || 
            error?.code === 429 || 
            error?.status === 'RESOURCE_EXHAUSTED' ||
            (error?.message && (error.message.includes('429') || error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('exhausted'))) ||
            errStr.includes('429') || 
            errStr.includes('RESOURCE_EXHAUSTED');

        if (isQuotaError && retries > 0) {
            console.warn(`Quota exceeded. Retrying in ${delay}ms... (${retries} retries left)`);
            await wait(delay);
            return callWithRetry(fn, retries - 1, delay * 2);
        }
        throw error;
    }
};

export const suggestImageName = async (imageBlob: Blob): Promise<string> => {
  try {
    const result = await callWithRetry(async () => {
        const ai = getClient();
        const base64Data = await blobToBase64(imageBlob);
        const model = "gemini-3-flash-preview"; 

        const response = await ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                {
                    inlineData: {
                    mimeType: "image/png",
                    data: base64Data
                    }
                },
                {
                    text: "Analyze this image and generate a concise, descriptive filename in kebab-case. Do not include the file extension. Example: 'login-screen-mockup' or 'architecture-diagram'. Return ONLY the filename string."
                }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        filename: {
                            type: Type.STRING,
                            description: "The suggested kebab-case filename without extension"
                        }
                    }
                }
            }
        });
        return response;
    });

    const jsonText = result.text;
    if (!jsonText) return `extracted-image-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const parsed = JSON.parse(jsonText);
    return parsed.filename || `extracted-image-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  } catch (error) {
    console.error("Gemini analysis failed after retries:", error);
    return `image-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
};

export const generateProjectReadme = async (
    pdfText: string, 
    imageFilenames: string[],
    settings: ReadmeSettings
): Promise<string> => {
    try {
        const result = await callWithRetry(async () => {
            const ai = getClient();
            const model = "gemini-3-flash-preview"; 

            // Truncate text if it's too long 
            const truncatedText = pdfText.slice(0, 100000); 

            const toneDescriptions = {
                professional: "formal, objective, and business-ready",
                tutorial: "educational, step-by-step, and friendly",
                marketing: "persuasive, exciting, and benefit-focused",
                minimalist: "concise, direct, and bullet-point heavy"
            };

            const prompt = `
            You are an expert technical writer. 
            Create a GitHub README.md based on the provided text extracted from a PDF.
            
            Configuration:
            - Tone: ${toneDescriptions[settings.tone]}
            - Additional User Context: ${settings.context || "None provided"}
            
            Context:
            - The user has extracted images from this PDF which are now located in a folder named 'images/'.
            - Available image filenames: ${imageFilenames.join(', ')}.
            
            Instructions:
            1. Analyze the PDF text to understand the project or document purpose.
            2. Write a structured README (Title, Description, Features/Sections, etc.).
            3. INTELLIGENTLY INSERT IMAGES: When a section describes something that likely corresponds to one of the image filenames, insert the image using Markdown syntax: ![Alt Text](images/filename.png).
            4. If images are generic or don't fit specific sections, add a "Gallery" or "Screenshots" section at the end.
            5. Return raw Markdown content.
            
            PDF Text Content:
            ${truncatedText}
            `;

            return await ai.models.generateContent({
                model: model,
                contents: prompt
            });
        });

        return result.text || "# README Generation Failed";
    } catch (error) {
        console.error("Readme generation failed", error);
        return "# Error generating README\n\nPlease try again.";
    }
}