export type Tool = 'select' | 'lasso' | 'pen' | 'highlighter' | 'eraser' | 'space' | 'text' | 'image' | 'shape' | 'hand';

export type LabelId = 'urgent' | 'progress' | 'done' | 'review' | 'archived';

export type NoteThemeId = string;

export type BlankPageTemplate = 'ruled' | 'plain' | 'grid' | 'cornell';

export type ShapeKind = string;

export type Point = {
  x: number;
  y: number;
  pressure?: number;
};

export type Stroke = {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  opacity?: number;
  points: Point[];
  z?: number;
};

export type TextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  minHeight: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: '400' | '600' | '700';
  backgroundColor?: string;
  z?: number;
};

export type ImageBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  dataUrl: string;
  name?: string;
  createdAt: string;
  rotation?: number;
  locked?: boolean;
  z?: number;
};

export type MathPlaneBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  gridStyle: 'lines' | 'dotted' | 'none';
  gridSpacing: number;
  showAxisLabels: boolean;
  showTickMarks: boolean;
  axisColor: string;
  gridColor: string;
  z?: number;
};

export type ShapeBox = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  opacity: number;
  fillColor?: string;
  z?: number;
};

export type PageAnnotations = {
  strokes: Stroke[];
  textBoxes: TextBox[];
  imageBoxes: ImageBox[];
  mathPlaneBoxes: MathPlaneBox[];
  shapeBoxes: ShapeBox[];
};

export type PageSpacer = {
  id: string;
  y: number;
  height: number;
  order?: number;
};

export type PdfNotebookPage = {
  key: string;
  kind: 'pdf';
  sourcePage: number;
  extraSpace: number;
  spacers: PageSpacer[];
  rotation?: 0 | 90 | 180 | 270;
  crop?: { top: number; right: number; bottom: number; left: number };
};

export type BlankNotebookPage = {
  key: string;
  kind: 'blank';
  width: number;
  height: number;
  extraSpace: number;
  spacers: PageSpacer[];
  template: BlankPageTemplate;
};

export type NotebookPage = PdfNotebookPage | BlankNotebookPage;

export type DocumentRecord = {
  id: string;
  name: string;
  pdfFileName?: string | null;
  themeId?: NoteThemeId;
  folder?: string;
  tags?: string[];
  label?: LabelId | null;
  docKind?: 'pdf' | 'notebook' | 'quick-note';
  deletedAt?: string | null;
  thumbnailDataUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  pages: NotebookPage[];
  annotations: Record<string, PageAnnotations | Stroke[]>;
  sourceDir?: string | null;
  pageTitles?: Record<string, string>;
  bookmarks?: Record<string, boolean>;
};

export type Library = {
  documents: DocumentRecord[];
};

export type CreatedFolderResult = {
  name: string;
  path: string;
} | null;

declare global {
  interface Window {
    showDirectoryPicker?: (options?: any) => Promise<any>;
    idb?: any;
    localNotes: {
      loadLibrary: () => Promise<Library>;
      saveDocument: (documentRecord: DocumentRecord) => Promise<DocumentRecord>;
      importPdf: () => Promise<DocumentRecord | null>;
      readPdf: (documentId: string) => Promise<Uint8Array>;
      runtime?: 'electron' | 'browser';
      savePdfExport: (defaultFileName: string, pdfBytes: Uint8Array | ArrayBuffer | number[], editableSidecar?: unknown) => Promise<string | null>;
      savePdfExportToFolder?: (folderPath: string, defaultFileName: string, pdfBytes: Uint8Array | ArrayBuffer | number[], editableSidecar?: unknown) => Promise<string | null>;
      createMappedFolder?: (folderName: string) => Promise<CreatedFolderResult>;
      deleteDocument: (documentId: string) => Promise<{ ok: boolean }>;
    };
  }
}
