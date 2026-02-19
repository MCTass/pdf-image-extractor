import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

interface ProcessedPdf {
  images: { blob: Blob; width: number; height: number; pageIndex: number }[];
  text: string;
}

interface ExtractedImageRaw {
    blob: Blob;
    width: number;
    height: number;
    pageIndex: number;
    source: 'render' | 'raw';
}

// Helper: SHA-256 Hash for deduplication
const getBlobHash = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

// Helper: Convert PDF.js image object to Blob
const convertPdfJsImageToBlob = async (imgObj: any): Promise<{ blob: Blob, width: number, height: number } | null> => {
    try {
        const width = imgObj.width;
        const height = imgObj.height;
        
        // Very small threshold to catch icons, but ignore single pixel spacers
        if (width < 10 || height < 10) return null;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Strategy A: Native Bitmap (Fastest)
        if (imgObj.bitmap) {
            ctx.drawImage(imgObj.bitmap, 0, 0);
        } 
        // Strategy B: Raw Data Construction
        else if (imgObj.data) {
             let imageData: ImageData | null = null;
             const len = imgObj.data.length;
             
             // RGBA
             if (len === width * height * 4) {
                 imageData = new ImageData(new Uint8ClampedArray(imgObj.data), width, height);
             } 
             // RGB -> RGBA
             else if (len === width * height * 3) {
                  const rgba = new Uint8ClampedArray(width * height * 4);
                  for (let i = 0, j = 0; i < len; i += 3, j += 4) {
                      rgba[j] = imgObj.data[i];
                      rgba[j+1] = imgObj.data[i+1];
                      rgba[j+2] = imgObj.data[i+2];
                      rgba[j+3] = 255;
                  }
                  imageData = new ImageData(rgba, width, height);
             } 
             // Grayscale -> RGBA
             else if (len === width * height) {
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

        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
        if (blob) return { blob, width, height };

    } catch (e) {
        console.warn("Image conversion failed", e);
    }
    return null;
};

// --- ENGINE 1: PDF.js (Visual Deep Scan) ---
// This handles PNGs, Masks, and complex color spaces correctly by rendering them.
const extractViaPdfJs = async (
    pdf: pdfjsLib.PDFDocumentProxy, 
    onProgress: (msg: string) => void
): Promise<{ images: ExtractedImageRaw[], text: string }> => {
    
    const images: ExtractedImageRaw[] = [];
    let fullText = "";
    const numPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        onProgress(`Scanning Page ${pageNum}/${numPages} (Deep Scan)...`);
        try {
            const page = await pdf.getPage(pageNum);
            
            // 1. Text Extraction
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;

            // 2. Force Resource Loading
            // Calling getOperatorList ensures all resources (images, fonts, forms) are loaded into page.objs
            const ops = await page.getOperatorList();
            
            // 3. Deep Object Scan
            // Instead of parsing OPS manually, we look at what PDF.js loaded into memory.
            // This catches images nested in Forms, Patterns, or referenced indirectly.
            
            const objectsToScan: any[] = [];

            // Helper to gather objects from internal caches
            const gatherObjects = (objStore: any) => {
                if (!objStore) return;
                
                // Access internal _objs map if it exists (standard in PDF.js)
                // @ts-ignore
                if (objStore._objs) {
                    // @ts-ignore
                    Object.values(objStore._objs).forEach((obj: any) => {
                        if (obj && (obj.data || obj.bitmap) && (obj.width && obj.height)) {
                            objectsToScan.push(obj);
                        }
                    });
                }
                
                // Also check the standard .get interface for known image names from Ops
                // (Fallback if _objs access fails or structure changes)
                 for (let i = 0; i < ops.fnArray.length; i++) {
                    if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject || 
                        ops.fnArray[i] === pdfjsLib.OPS.paintXObject) {
                        const name = ops.argsArray[i][0];
                        if (typeof name === 'string') {
                            try {
                                // We can't synchronously get them here easily if not in _objs, 
                                // but getOperatorList usually populates _objs.
                            } catch(e) {}
                        }
                    }
                    if (ops.fnArray[i] === pdfjsLib.OPS.paintInlineImageXObject) {
                        const imgObj = ops.argsArray[i][0];
                        if (imgObj) objectsToScan.push(imgObj);
                    }
                }
            };

            // @ts-ignore
            gatherObjects(page.objs);
            // @ts-ignore
            gatherObjects(page.commonObjs);

            // Process unique objects found on this page
            const uniquePageObjects = new Set(objectsToScan);
            
            for (const imgObj of uniquePageObjects) {
                const result = await convertPdfJsImageToBlob(imgObj);
                if (result) {
                    images.push({ ...result, pageIndex: pageNum, source: 'render' });
                }
            }

            page.cleanup();
        } catch (e) {
            console.error(`Page ${pageNum} error:`, e);
        }
    }
    return { images, text: fullText };
};


// --- ENGINE 2: PDF-lib (Raw JPEG Extraction) ---
// This is strictly for JPEGs and JP2s to preserve original file data.
// We DO NOT attempt to decode PNGs/Flate here anymore to avoid corruption/missing images.
const extractViaPdfLib = async (
    arrayBuffer: ArrayBuffer,
    onProgress: (msg: string) => void
): Promise<ExtractedImageRaw[]> => {
    const images: ExtractedImageRaw[] = [];
    onProgress("Extracting embedded JPEGs...");

    try {
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const context = pdfDoc.context;
        const indirectObjects = context.enumerateIndirectObjects();
        
        for (const [ref, obj] of indirectObjects) {
            if (
                obj instanceof PDFRawStream &&
                obj.dict.lookup(PDFName.of('Type')) === PDFName.of('XObject') &&
                obj.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')
            ) {
                const width = (obj.dict.lookup(PDFName.of('Width')) as any)?.value || 0;
                const height = (obj.dict.lookup(PDFName.of('Height')) as any)?.value || 0;
                const filter = obj.dict.lookup(PDFName.of('Filter'));

                if (width < 10 || height < 10) continue;

                // Check for JPEG (DCTDecode) or JPEG2000 (JPXDecode)
                let isJpeg = filter === PDFName.of('DCTDecode');
                let isJp2 = filter === PDFName.of('JPXDecode');
                
                // Handle filter arrays (e.g. [DCTDecode])
                if (Array.isArray(filter) && filter.length > 0) {
                     // If multiple filters exist, it's often complex (e.g. Hex + DCT), 
                     // but usually just [DCTDecode].
                     // If it includes FlateDecode, it's NOT a raw JPEG.
                     const filters = filter as any[];
                     const hasFlate = filters.some(f => f === PDFName.of('FlateDecode'));
                     
                     if (!hasFlate) {
                        if (filters.some(f => f === PDFName.of('DCTDecode'))) isJpeg = true;
                        if (filters.some(f => f === PDFName.of('JPXDecode'))) isJp2 = true;
                     }
                }

                if (isJpeg || isJp2) {
                    const data = obj.getContents();
                    const mime = isJpeg ? 'image/jpeg' : 'image/jp2';
                    images.push({
                        blob: new Blob([data], { type: mime }),
                        width,
                        height,
                        pageIndex: 0, // Raw extraction doesn't know page index easily
                        source: 'raw'
                    });
                }
            }
        }
    } catch (e) {
        console.error("PDF-lib extraction failed:", e);
    }

    return images;
};


// --- MAIN COORDINATOR ---
export const processPdf = async (
  file: File, 
  onProgress: (current: number, total: number) => void
): Promise<ProcessedPdf> => {
  
  const arrayBuffer = await file.arrayBuffer();
  
  // 1. Start PDF.js Task
  const pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  
  // 2. Run both engines
  // We use PDF.js for "Deep Scan" (everything) and PDF-lib for "Quick Scan" (JPEGs)
  const pdfJsPromise = extractViaPdfJs(pdfJsDoc, (msg) => {});
  const pdfLibPromise = extractViaPdfLib(arrayBuffer.slice(0), (msg) => {});

  const [pdfJsResult, pdfLibResult] = await Promise.all([pdfJsPromise, pdfLibPromise]);

  // 3. Intelligent Deduplication
  const uniqueImages: { blob: Blob; width: number; height: number; pageIndex: number }[] = [];
  const processedHashes = new Set<string>();
  const processedDimensions = new Set<string>(); // "width x height"

  // Step A: Add Raw JPEGs first (Best Quality)
  // We trust these are unique source files.
  for (const img of pdfLibResult) {
      const hash = await getBlobHash(img.blob);
      if (processedHashes.has(hash)) continue;
      
      processedHashes.add(hash);
      processedDimensions.add(`${img.width}x${img.height}`);
      
      uniqueImages.push({
          blob: img.blob,
          width: img.width,
          height: img.height,
          pageIndex: 0 // Will be sorted to bottom or mixed
      });
  }

  // Step B: Add Rendered Images (PDF.js)
  // These include PNGs, but also re-encoded versions of the JPEGs we just found.
  for (const img of pdfJsResult.images) {
      const hash = await getBlobHash(img.blob);
      
      // 1. Check exact content match (unlikely between JPEG and PNG, but possible for PNG-PNG)
      if (processedHashes.has(hash)) continue;

      // 2. Check Dimension Match to avoid duplicates of the JPEGs we already found.
      // If we found a raw JPEG 1024x768, and now we see a rendered PNG 1024x768, 
      // it's 99% likely the same image. We skip the PNG to prefer the raw JPEG.
      // Exception: If the PDF has multiple DIFFERENT images with exact same dimensions.
      // This is a risk, but "extracting same image twice" is a bigger user complaint.
      // To be safer, we could compare aspect ratios or histogram, but dimensions is a good heuristic.
      // We only skip if the RAW extractor found something with these dims.
      if (processedDimensions.has(`${img.width}x${img.height}`)) {
         // Potential duplicate. 
         // Let's rely on the user manually deleting if it's actually different, 
         // OR we can include it. 
         // Given "It extracts only two same images", duplication is the enemy.
         // However, if there are 2 distinct slides both 1920x1080, we lose one.
         // Let's refine: Only skip if it's likely a photo (large). 
         // Actually, let's DISABLE this dimension check for now to ensure we catch ALL images.
         // Better to have duplicates than missing images.
         // console.log("Dimension match found, but keeping to ensure coverage.");
      }

      processedHashes.add(hash);
      
      uniqueImages.push({
          blob: img.blob,
          width: img.width,
          height: img.height,
          pageIndex: img.pageIndex
      });
  }

  // Sort: Put images with page numbers first, sorted by page
  uniqueImages.sort((a, b) => {
      // If both have page index, sort by it
      if (a.pageIndex > 0 && b.pageIndex > 0) return a.pageIndex - b.pageIndex;
      // If one is raw (0) and other is page (n), put page first? Or raw first?
      // Usually raw files don't have order. Let's put page-associated ones first.
      if (a.pageIndex > 0) return -1;
      if (b.pageIndex > 0) return 1;
      return 0;
  });

  return { 
      images: uniqueImages, 
      text: pdfJsResult.text 
  };
};