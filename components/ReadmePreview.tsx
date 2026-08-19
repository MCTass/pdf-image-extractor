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
            h1: ({children}) => <h1 className="text-2xl md:text-3xl font-black mb-6 border-b border-slate-800 pb-3 text-white tracking-tight">{children}</h1>,
            h2: ({children}) => <h2 className="text-lg md:text-xl font-bold mt-8 mb-3 text-slate-100 flex items-center gap-2 border-b border-slate-800/60 pb-2">
              <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
              {children}
            </h2>,
            h3: ({children}) => <h3 className="text-base font-semibold mt-6 mb-2 text-indigo-200">{children}</h3>,
            p: ({children}) => <p className="leading-relaxed text-slate-300 mb-4 text-sm md:text-base">{children}</p>,
            ul: ({children}) => <ul className="list-disc list-inside space-y-1.5 mb-4 text-slate-300 text-sm md:text-base">{children}</ul>,
            ol: ({children}) => <ol className="list-decimal list-inside space-y-1.5 mb-4 text-slate-300 text-sm md:text-base">{children}</ol>,
            li: ({children}) => <li className="text-slate-300">{children}</li>,
            blockquote: ({children}) => <blockquote className="border-l-4 border-indigo-500/70 bg-indigo-500/5 px-4 py-2 my-4 rounded-r-lg text-slate-300 italic text-sm">{children}</blockquote>,
            table: ({children}) => <div className="overflow-x-auto my-6 rounded-xl border border-slate-800"><table className="w-full text-left text-sm text-slate-300 divide-y divide-slate-800">{children}</table></div>,
            th: ({children}) => <th className="bg-slate-900 px-4 py-2.5 font-semibold text-slate-100 text-xs uppercase tracking-wider">{children}</th>,
            td: ({children}) => <td className="px-4 py-2.5 border-t border-slate-800/60 bg-slate-950/40 text-sm">{children}</td>,
            code: ({children}) => <code className="bg-slate-900 border border-slate-800 text-indigo-300 px-1.5 py-0.5 rounded font-mono text-xs">{children}</code>,
            pre: ({children}) => <pre className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl overflow-x-auto my-6 font-mono text-xs text-slate-200 shadow-inner">{children}</pre>
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default ReadmePreview;