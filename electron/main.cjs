const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const isDev = !app.isPackaged;
let mainWindow;

function getIconPath() {
  const pngPath = path.join(__dirname, '..', 'build', 'icon.png');
  return pngPath;
}

function getRootDir() {
  return path.join(app.getPath('userData'), 'dux-notes-data');
}

function getDocsDir() {
  return path.join(getRootDir(), 'documents');
}

function getLibraryPath() {
  return path.join(getRootDir(), 'library.json');
}

function safeFilePart(value, fallback = 'Untitled') {
  const clean = String(value || fallback).replace(/[\\/:*?"<>|]/g, '-').trim();
  return clean || fallback;
}

function sidecarPathFor(pdfPath) {
  return `${pdfPath}.localnotes.json`;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.from(data);
  if (data && data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
  if (data && typeof data === 'object') {
    const numericKeys = Object.keys(data).filter((key) => /^\d+$/.test(key));
    if (numericKeys.length > 0) {
      numericKeys.sort((a, b) => Number(a) - Number(b));
      return Buffer.from(numericKeys.map((key) => Number(data[key])));
    }
  }
  return Buffer.from(data);
}

async function writeEditableSidecar(pdfPath, editableSidecar) {
  if (!editableSidecar) return;
  await fs.writeFile(sidecarPathFor(pdfPath), JSON.stringify(editableSidecar, null, 2), 'utf8');
}

async function readEditableSidecar(pdfPath) {
  try {
    const raw = await fs.readFile(sidecarPathFor(pdfPath), 'utf8');
    const parsed = JSON.parse(raw);
    if ((parsed?.app === 'Dux Notes' || parsed?.app === 'Local Notes') && parsed?.document) return parsed;
  } catch {
    // No editable sidecar found. This is a normal imported PDF.
  }
  return null;
}

async function ensureStorage() {
  await fs.mkdir(getDocsDir(), { recursive: true });
  try {
    await fs.access(getLibraryPath());
  } catch {
    await fs.writeFile(getLibraryPath(), JSON.stringify({ documents: [] }, null, 2), 'utf8');
  }
}

async function readLibrary() {
  await ensureStorage();
  const libraryPath = getLibraryPath();

  try {
    const raw = await fs.readFile(libraryPath, 'utf8');
    const trimmed = String(raw || '').trim();
    const parsed = trimmed ? JSON.parse(trimmed) : { documents: [] };

    if (!parsed || !Array.isArray(parsed.documents)) {
      return { documents: [] };
    }

    return parsed;
  } catch (error) {
    console.error('Local library could not be read. A fresh empty library will be created.', error);

    const backupName = `library-broken-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const backupPath = path.join(getRootDir(), backupName);

    try {
      await fs.rename(libraryPath, backupPath);
    } catch {
      // If there is no readable file to back up, continue with a clean library.
    }

    const freshLibrary = { documents: [] };
    await fs.writeFile(libraryPath, JSON.stringify(freshLibrary, null, 2), 'utf8');
    return freshLibrary;
  }
}

async function writeLibrary(library) {
  await ensureStorage();
  await fs.writeFile(getLibraryPath(), JSON.stringify(library, null, 2), 'utf8');
}

function createWindow() {
  app.setName('Dux Notes');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#F1E9D2',
    icon: getIconPath(),
    title: 'Dux Notes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await ensureStorage();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('library:load', async () => {
  return await readLibrary();
});

ipcMain.handle('library:saveDocument', async (_event, documentRecord) => {
  const library = await readLibrary();
  const now = new Date().toISOString();
  documentRecord.updatedAt = now;

  const index = library.documents.findIndex((doc) => doc.id === documentRecord.id);
  if (index >= 0) {
    library.documents[index] = documentRecord;
  } else {
    library.documents.unshift(documentRecord);
  }

  await writeLibrary(library);
  return documentRecord;
});

ipcMain.handle('pdf:import', async () => {
  await ensureStorage();
  const ownerWindow = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(ownerWindow, {
    title: 'Import PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF files', extensions: ['pdf'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const sourcePath = result.filePaths[0];
  await fs.access(sourcePath);
  const sidecar = await readEditableSidecar(sourcePath);
  const id = crypto.randomUUID();
  const fileName = `${id}.pdf`;
  const destPath = path.join(getDocsDir(), fileName);
  const now = new Date().toISOString();

  let doc;
  if (sidecar?.document) {
    const sourceDoc = sidecar.document;
    if (sidecar.originalPdfBase64) {
      await fs.writeFile(destPath, Buffer.from(sidecar.originalPdfBase64, 'base64'));
    } else if (sourceDoc.pdfFileName) {
      await fs.copyFile(sourcePath, destPath);
    }

    doc = {
      ...sourceDoc,
      id,
      name: path.basename(sourcePath),
      pdfFileName: sidecar.originalPdfBase64 || sourceDoc.pdfFileName ? fileName : null,
      sourceDir: path.dirname(sourcePath),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      thumbnailDataUrl: null
    };
  } else {
    await fs.copyFile(sourcePath, destPath);
    doc = {
      id,
      name: path.basename(sourcePath),
      pdfFileName: fileName,
      sourceDir: path.dirname(sourcePath),
      createdAt: now,
      updatedAt: now,
      pages: [],
      annotations: {}
    };
  }

  const library = await readLibrary();
  library.documents.unshift(doc);
  await writeLibrary(library);

  return doc;
});

ipcMain.handle('pdf:read', async (_event, documentId) => {
  await ensureStorage();
  const library = await readLibrary();
  const doc = library.documents.find((item) => item.id === documentId);
  if (!doc || !doc.pdfFileName) throw new Error('PDF not found in local library.');

  const pdfPath = path.join(getDocsDir(), doc.pdfFileName);
  const buffer = await fs.readFile(pdfPath);
  // Return a plain byte array so packaged Electron builds, Vite dev builds, and
  // different structured-clone paths all give the renderer the same shape.
  return Array.from(buffer);
});


ipcMain.handle('pdf:export', async (_event, defaultFileName, pdfBytes, editableSidecar) => {
  const safeDefaultName = safeFilePart(defaultFileName || 'Dux Notes Export.pdf', 'Dux Notes Export.pdf');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save notebook as PDF',
    defaultPath: safeDefaultName.endsWith('.pdf') ? safeDefaultName : `${safeDefaultName}.pdf`,
    filters: [{ name: 'PDF files', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.writeFile(result.filePath, toBuffer(pdfBytes));
  await writeEditableSidecar(result.filePath, editableSidecar);
  return result.filePath;
});

ipcMain.handle('folder:createMapped', async (_event, folderName) => {
  const safeFolderName = safeFilePart(folderName, 'New Folder');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: `Choose where to create "${safeFolderName}"`,
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const targetPath = path.join(result.filePaths[0], safeFolderName);
  await fs.mkdir(targetPath, { recursive: true });
  return { name: safeFolderName, path: targetPath };
});

ipcMain.handle('pdf:exportToFolder', async (_event, folderPath, defaultFileName, pdfBytes, editableSidecar) => {
  if (!folderPath) return null;
  await fs.mkdir(folderPath, { recursive: true });
  const safeDefaultName = safeFilePart(defaultFileName || 'Dux Notes Export.pdf', 'Dux Notes Export.pdf');
  const fileName = safeDefaultName.toLowerCase().endsWith('.pdf') ? safeDefaultName : `${safeDefaultName}.pdf`;
  const destPath = path.join(folderPath, fileName);
  await fs.writeFile(destPath, toBuffer(pdfBytes));
  await writeEditableSidecar(destPath, editableSidecar);
  return destPath;
});

ipcMain.handle('document:delete', async (_event, documentId) => {
  const library = await readLibrary();
  const doc = library.documents.find((item) => item.id === documentId);
  const nextDocs = library.documents.filter((item) => item.id !== documentId);
  await writeLibrary({ documents: nextDocs });

  if (doc?.pdfFileName) {
    try {
      await fs.unlink(path.join(getDocsDir(), doc.pdfFileName));
    } catch {
      // The PDF may have already been removed. Do not block deleting the library entry.
    }
  }

  return { ok: true };
});
