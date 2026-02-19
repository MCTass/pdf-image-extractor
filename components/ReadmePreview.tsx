import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ExtractedImage } from '../types';

interface ReadmePreviewProps {
  markdown: string;
  images: ExtractedImage[];
}

const ReadmePreview: React.FC<ReadmePreviewProps> = ({ markdown, images }) => {
  
  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    images.forEach(img => {
      const url = URL.createObjectURL(img.blob);
      if (img.suggestedName) map.set(img.suggestedName, url);
      map.set(img.originalName, url);
      map.set(img.suggestedName.toLowerCase(), url);
    });
    return map;
  }, [images]);

  React.useEffect(() => {
    return () => {
      imageMap.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imageMap]);

  return (
    <div className="h-full w-full bg-[#0a0f1d] overflow-y-auto custom-scrollbar">
      <div className="prose prose-invert prose-slate prose-sm md:prose-base max-w-none p-6 md:p-10">
        <ReactMarkdown
          components={{
            img: ({ node, src, alt, ...props }) => {
              if (!src) return <img alt={alt} {...props} />;

              if (src.startsWith('images/')) {
                const filename = src.replace('images/', '').replace(/\.[^/.]+$/, "");
                const blobUrl = imageMap.get(filename) || imageMap.get(filename.toLowerCase());
                
                if (blobUrl) {
                  return (
                    <div className="my-8 group relative">
                       <img 
                          src={blobUrl} 
                          alt={alt} 
                          className="max-w-full rounded-2xl border border-slate-800 shadow-2xl mx-auto transition-transform group-hover:scale-[1.01]" 
                          {...props} 
                       />
                       <div className="mt-3 flex items-center justify-center gap-2">
                          <span className="h-px w-8 bg-slate-800" />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">
                             Preview: {filename}
                          </span>
                          <span className="h-px w-8 bg-slate-800" />
                       </div>
                    </div>
                  );
                }
              }
              return <img src={src} alt={alt} className="rounded-xl border border-slate-800" {...props} />;
            },
            h1: ({children}) => <h1 className="text-3xl font-black mb-8 border-b border-slate-800 pb-4 text-white tracking-tight">{children}</h1>,
            h2: ({children}) => <h2 className="text-xl font-bold mt-10 mb-4 text-indigo-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              {children}
            </h2>,
            p: ({children}) => <p className="leading-relaxed text-slate-400 mb-4">{children}</p>,
            code: ({children}) => <code className="bg-slate-900 text-indigo-300 px-1.5 py-0.5 rounded font-mono text-xs">{children}</code>,
            pre: ({children}) => <pre className="bg-slate-950 border border-slate-800 p-4 rounded-xl overflow-x-auto my-6">{children}</pre>
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default ReadmePreview;