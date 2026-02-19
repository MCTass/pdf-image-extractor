export interface ExtractedImage {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  originalName: string;
  suggestedName: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  pageIndex: number;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  EXTRACTING = 'EXTRACTING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface AppState {
  status: ProcessingStatus;
  images: ExtractedImage[];
  error?: string;
  progress: number;
}

export type ReadmeTone = 'professional' | 'tutorial' | 'marketing' | 'minimalist';

export interface ReadmeSettings {
  tone: ReadmeTone;
  context: string;
}