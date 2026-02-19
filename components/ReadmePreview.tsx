import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ExtractedImage } from '../types';

interface ReadmePreviewProps {
  markdown: string;
  images: ExtractedImage[];
}

const ReadmePreview: React.FC<ReadmePreviewProps> = ({ markdown, images }) => {
  
  // Map filenames to blob URLs for quick lookup
  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    images.forEach(img => {
      // Create a temporary URL for the blob
      const url = URL.createObjectURL(img.blob);
      // Map both suggested and original names
      if (img.suggestedName) map.set(img.suggestedName, url);
      map.set(img.originalName, url);
      // Also map sanitized versions just in case
      map.set(img.suggestedName.toLowerCase(), url);
    });
    return map;
  }, [images]);

  // Cleanup URLs on unmount
  React.useEffect(() => {
    return () => {
      imageMap.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imageMap]);

  return (
    <div className="prose prose-invert prose-sm max-w-none p-6 bg-slate-900 rounded-lg overflow-y-auto h-96 custom-scrollbar">
      <ReactMarkdown
        components={{
          img: ({ node, src, alt, ...props }) => {
            if (!src) return <img alt={alt} {...props} />;

            // Check if it's a local image reference
            if (src.startsWith('images/')) {
              const filename = src.replace('images/', '').replace(/\.[^/.]+$/, ""); // remove path and extension
              const blobUrl = imageMap.get(filename) || imageMap.get(filename.toLowerCase());
              
              if (blobUrl) {
                return (
                  <span className="block my-4">
                     <img 
                        src={blobUrl} 
                        alt={alt} 
                        className="max-w-full rounded-lg border border-slate-700 shadow-md mx-auto" 
                        {...props} 
                     />
                     <span className="block text-center text-xs text-slate-500 mt-1 italic">
                        (Preview of {filename})
                     </span>
                  </span>
                );
              }
            }
            return <img src={src} alt={alt} {...props} />;
          }
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default ReadmePreview;