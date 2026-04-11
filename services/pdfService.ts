import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

// Use a stable CDN worker URL to avoid resolution issues in the browser environment
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

interface ProcessedPdf {
  images: { blob: Blob; width: number; height: number; pageIndex: number }[];
  text: string;
}

interface ExtractedImageRaw {
  blob: Blob;
  width: number;
  height: number;
  pageIndex: number;
}

// Helper: SHA-256 Hash with FNV-1a fallback
const getBlobHash = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  
  if (globalThis.crypto?.subtle?.digest) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (e) {
      console.warn("Subtle crypto failed, falling back to FNV-1a", e);
    }
  }

  // FNV-1a Fallback
  const bytes = new Uint8Array(buffer);
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}-${bytes.length}`;
};

// Helper: Convert PDF.js image object to Blob
const convertPdfJsImageToBlob = async (
  imgObj: any,
): Promise<{ blob: Blob; width: number; height: number } | null> => {
  try {
    const width = imgObj.width;
    const height = imgObj.height;

    if (!width || !height || width < 5 || height < 5) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (imgObj.bitmap) {
      ctx.drawImage(imgObj.bitmap, 0, 0);
    } else if (imgObj.data) {
      const len = imgObj.data.length;
      let imageData: ImageData | null = null;

      if (len === width * height * 4) {
        imageData = new ImageData(new Uint8ClampedArray(imgObj.data), width, height);
      } else if (len === width * height * 3) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0, j = 0; i < len; i += 3, j += 4) {
          rgba[j] = imgObj.data[i];
          rgba[j + 1] = imgObj.data[i + 1];
          rgba[j + 2] = imgObj.data[i + 2];
          rgba[j + 3] = 255;
        }
        imageData = new ImageData(rgba, width, height);
      } else if (len === width * height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < len; i++) {
          const val = imgObj.data[i];
          rgba[i * 4] = val;
          rgba[i * 4 + 1] = val;
          rgba[i * 4 + 2] = val;
          rgba[i * 4 + 3] = 255;
        }
        imageData = new ImageData(rgba, width, height);
      }

      if (imageData) {
        ctx.putImageData(imageData, 0, 0);
      } else {
        return null;
      }
    } else {
      return null;
    }

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (blob) return { blob, width, height };
  } catch (e) {
    console.warn("Image conversion failed", e);
  }
  return null;
};

// Robust async object resolution
const getObjectFromStore = (store: any, key: string): Promise<any | null> => {
  return new Promise((resolve) => {
    if (!store) return resolve(null);
    try {
      // Modern PDF.js uses a Map-like structure for _objs
      if (store._objs && store._objs instanceof Map && store._objs.has(key)) {
        return resolve(store._objs.get(key));
      }
      // Fallback to the get method with callback
      store.get(key, (obj: any) => resolve(obj || null));
    } catch (e) {
      resolve(null);
    }
    // Safety timeout
    setTimeout(() => resolve(null), 500);
  });
};

// Fallback scan for objects already in the store
const collectFromObjStore = async (store: any, pageIndex: number): Promise<ExtractedImageRaw[]> => {
  const images: ExtractedImageRaw[] = [];
  if (!store || !store._objs) return images;

  const objs = store._objs instanceof Map ? Array.from(store._objs.values()) : Object.values(store._objs);
  
  for (const obj of objs as any[]) {
    if (obj && (obj.data || obj.bitmap) && obj.width && obj.height) {
      const result = await convertPdfJsImageToBlob(obj);
      if (result) images.push({ ...result, pageIndex });
    }
  }
  return images;
};

const extractViaPdfJs = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  onPageProgress: (current: number, total: number) => void,
): Promise<{ images: ExtractedImageRaw[]; text: string }> => {
  const images: ExtractedImageRaw[] = [];
  let fullText = "";
  const numPages = pdf.numPages;
  const OPS = (pdfjsLib as any).OPS || {};

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onPageProgress(pageNum, numPages);
    try {
      const page = await pdf.getPage(pageNum);
      
      // Text Extraction
      const textContent = await page.getTextContent();
      fullText += `\n--- Page ${pageNum} ---\n` + textContent.items.map((i: any) => i.str).join(" ") + "\n";

      // Operator-driven image scan
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        
        // Handle various image-related operators
        if (
          fn === OPS.paintImageXObject || 
          fn === OPS.paintXObject || 
          fn === OPS.paintJpegXObject ||
          fn === OPS.paintImageMaskXObject ||
          fn === OPS.paintImageMaskXObjectRepeat ||
          fn === OPS.paintImageXObjectRepeat
        ) {
          const name = ops.argsArray[i][0];
          if (typeof name === 'string') {
            // Resolve from both page-specific and common objects
            const imgObj = await getObjectFromStore((page as any).objs, name) || 
                           await getObjectFromStore((page as any).commonObjs, name);
            if (imgObj) {
              const result = await convertPdfJsImageToBlob(imgObj);
              if (result) images.push({ ...result, pageIndex: pageNum });
            }
          }
        } else if (fn === OPS.paintInlineImageXObject || fn === OPS.paintSolidColorImageMask) {
          const imgObj = ops.argsArray[i][0];
          if (imgObj) {
            const result = await convertPdfJsImageToBlob(imgObj);
            if (result) images.push({ ...result, pageIndex: pageNum });
          }
        }
      }

      // Fallback: Scan internal stores just in case operators missed something
      const pageStoreImgs = await collectFromObjStore((page as any).objs, pageNum);
      const commonStoreImgs = await collectFromObjStore((page as any).commonObjs, pageNum);
      images.push(...pageStoreImgs, ...commonStoreImgs);

      page.cleanup();
    } catch (e) {
      console.error(`Error processing page ${pageNum}:`, e);
    }
  }
  return { images, text: fullText };
};

const extractViaPdfLibRaw = async (arrayBuffer: ArrayBuffer): Promise<ExtractedImageRaw[]> => {
  const images: ExtractedImageRaw[] = [];
  try {
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const indirectObjects = pdfDoc.context.enumerateIndirectObjects();

    for (const [ref, obj] of indirectObjects) {
      if (
        obj instanceof PDFRawStream &&
        obj.dict.lookup(PDFName.of("Type")) === PDFName.of("XObject") &&
        obj.dict.lookup(PDFName.of("Subtype")) === PDFName.of("Image")
      ) {
        const width = (obj.dict.lookup(PDFName.of("Width")) as any)?.value || 0;
        const height = (obj.dict.lookup(PDFName.of("Height")) as any)?.value || 0;
        const filter = obj.dict.lookup(PDFName.of("Filter"));

        if (width < 5 || height < 5) continue;

        // Extract JPEGs or JPXs specifically as they are usually high-value assets
        const filters = Array.isArray(filter) ? filter : [filter];
        const isSupported = filters.some(f => 
          f === PDFName.of("DCTDecode") || f === PDFName.of("JPXDecode")
        );

        if (isSupported) {
          images.push({
            blob: new Blob([obj.getContents()], { type: "image/jpeg" }),
            width, height, pageIndex: 0
          });
        }
      }
    }
  } catch (e) {
    console.warn("Structural scan failed:", e);
  }
  return images;
};

export const processPdf = async (
  file: File,
  onProgress: (current: number, total: number) => void,
): Promise<ProcessedPdf> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;

  const [pdfJsResult, pdfLibResult] = await Promise.all([
    extractViaPdfJs(pdfJsDoc, onProgress),
    extractViaPdfLibRaw(arrayBuffer.slice(0))
  ]);

  const uniqueImages: { blob: Blob; width: number; height: number; pageIndex: number }[] = [];
  const hashes = new Set<string>();

  for (const img of [...pdfJsResult.images, ...pdfLibResult]) {
    const hash = await getBlobHash(img.blob);
    if (!hashes.has(hash)) {
      hashes.add(hash);
      uniqueImages.push({ 
        blob: img.blob, 
        width: img.width, 
        height: img.height, 
        pageIndex: img.pageIndex 
      });
    }
  }

  uniqueImages.sort((a, b) => (a.pageIndex || 999) - (b.pageIndex || 999));

  return { 
    images: uniqueImages, 
    text: pdfJsResult.text 
  };
};