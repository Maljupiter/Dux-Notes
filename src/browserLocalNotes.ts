import type { CreatedFolderResult, DocumentRecord, Library } from './types';

const BROWSER_LIBRARY_KEY = 'dux-notes-browser-library-v1';
const BROWSER_DB_NAME = 'dux-notes-browser-files-v1';
const BROWSER_DB_VERSION = 1;
const PDF_STORE = 'pdfs';

function makeBrowserId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLibrary(): Library {
  return { documents: [] };
}

function safeReadLibrary(): Library {
  try {
    const raw = window.localStorage.getItem(BROWSER_LIBRARY_KEY);
    if (!raw) return emptyLibrary();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.documents)) return emptyLibrary();
    return { documents: parsed.documents };
  } catch (error) {
    console.warn('Browser library could not be read. Starting with a clean library.', error);
    return emptyLibrary();
  }
}

function writeLibrary(library: Library) {
  window.localStorage.setItem(BROWSER_LIBRARY_KEY, JSON.stringify({ documents: library.documents || [] }));
}

function openBrowserDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(BROWSER_DB_NAME, BROWSER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
  });
}

async function withPdfStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openBrowserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, mode);
    const store = tx.objectStore(PDF_STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Browser file storage failed.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Browser file storage transaction failed.'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Browser file storage transaction was cancelled.'));
    };
  });
}

async function putPdf(fileName: string, bytes: ArrayBuffer) {
  await withPdfStore('readwrite', (store) => store.put(bytes, fileName));
}

async function getPdf(fileName: string) {
  return await withPdfStore<ArrayBuffer | undefined>('readonly', (store) => store.get(fileName));
}

async function deletePdf(fileName: string) {
  await withPdfStore('readwrite', (store) => store.delete(fileName));
}

function choosePdfFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      input.remove();
      resolve(file);
    }, { once: true });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    }, { once: true });
    input.click();
  });
}

function downloadBrowserFile(fileName: string, data: Uint8Array | ArrayBuffer | string, mimeType: string) {
  const blobPart = typeof data === 'string' ? data : data instanceof ArrayBuffer ? data : data.slice().buffer;
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function ensureBrowserLocalNotes() {
  if (typeof window === 'undefined') return;
  if ((window as any).localNotes?.loadLibrary) return;

  window.localNotes = {
    async loadLibrary(): Promise<Library> {
      return safeReadLibrary();
    },

    async saveDocument(documentRecord: DocumentRecord): Promise<DocumentRecord> {
      const library = safeReadLibrary();
      const now = new Date().toISOString();
      const next: DocumentRecord = { ...documentRecord, updatedAt: now };
      const index = library.documents.findIndex((doc) => doc.id === next.id);
      if (index >= 0) library.documents[index] = next;
      else library.documents.unshift(next);
      writeLibrary(library);
      return next;
    },

    async importPdf(): Promise<DocumentRecord | null> {
      if (!window.indexedDB) throw new Error('This browser does not support local PDF storage.');
      const file = await choosePdfFile();
      if (!file) return null;
      const id = makeBrowserId();
      const fileName = `${id}.pdf`;
      const bytes = await file.arrayBuffer();
      await putPdf(fileName, bytes);
      const now = new Date().toISOString();
      const doc: DocumentRecord = {
        id,
        name: file.name || 'Imported PDF.pdf',
        pdfFileName: fileName,
        sourceDir: 'iPad / browser import',
        createdAt: now,
        updatedAt: now,
        pages: [],
        annotations: {}
      };
      const library = safeReadLibrary();
      library.documents.unshift(doc);
      writeLibrary(library);
      return doc;
    },

    async readPdf(documentId: string): Promise<Uint8Array> {
      const library = safeReadLibrary();
      const doc = library.documents.find((item) => item.id === documentId);
      if (!doc?.pdfFileName) throw new Error('PDF not found in browser storage.');
      const bytes = await getPdf(doc.pdfFileName);
      if (!bytes) throw new Error('PDF file is missing from browser storage.');
      return new Uint8Array(bytes);
    },

    async savePdfExport(defaultFileName: string, pdfBytes: Uint8Array | ArrayBuffer, editableSidecar?: unknown): Promise<string | null> {
      const fileName = defaultFileName?.toLowerCase().endsWith('.pdf') ? defaultFileName : `${defaultFileName || 'Dux Notes Export'}.pdf`;
      downloadBrowserFile(fileName, pdfBytes, 'application/pdf');
      if (editableSidecar) downloadBrowserFile(`${fileName}.localnotes.json`, JSON.stringify(editableSidecar, null, 2), 'application/json');
      return `Downloaded ${fileName}`;
    },

    async savePdfExportToFolder(_folderPath: string, defaultFileName: string, pdfBytes: Uint8Array | ArrayBuffer, editableSidecar?: unknown): Promise<string | null> {
      return window.localNotes.savePdfExport(defaultFileName, pdfBytes, editableSidecar);
    },

    async createMappedFolder(_folderName: string): Promise<CreatedFolderResult> {
      return null;
    },

    async deleteDocument(documentId: string): Promise<{ ok: boolean }> {
      const library = safeReadLibrary();
      const doc = library.documents.find((item) => item.id === documentId);
      const nextDocs = library.documents.filter((item) => item.id !== documentId);
      writeLibrary({ documents: nextDocs });
      if (doc?.pdfFileName) {
        try {
          await deletePdf(doc.pdfFileName);
        } catch (error) {
          console.warn('Could not delete browser PDF file:', error);
        }
      }
      return { ok: true };
    }
  };
}
