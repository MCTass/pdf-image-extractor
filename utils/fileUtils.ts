import JSZip from 'jszip';
import { ExtractedImage } from '../types';

export const createZip = async (images: ExtractedImage[]): Promise<Blob> => {
  const zip = new JSZip();
  
  // Create images folder
  const imgFolder = zip.folder("images");
  
  // Track used names to avoid duplicates
  const usedNames = new Set<string>();

  images.forEach((img) => {
    let fileName = img.suggestedName || img.originalName;
    
    // Sanitize filename
    fileName = fileName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    
    // Ensure uniqueness
    let finalName = fileName;
    let counter = 1;
    while (usedNames.has(finalName)) {
      finalName = `${fileName}-${counter}`;
      counter++;
    }
    usedNames.add(finalName);
    
    if (imgFolder) {
        imgFolder.file(`${finalName}.png`, img.blob);
    }
  });

  return await zip.generateAsync({ type: 'blob' });
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};