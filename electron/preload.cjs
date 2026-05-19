const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localNotes', {
  runtime: 'electron',
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveDocument: (documentRecord) => ipcRenderer.invoke('library:saveDocument', documentRecord),
  importPdf: () => ipcRenderer.invoke('pdf:import'),
  readPdf: (documentId) => ipcRenderer.invoke('pdf:read', documentId),
  savePdfExport: (defaultFileName, pdfBytes, editableSidecar) => ipcRenderer.invoke('pdf:export', defaultFileName, pdfBytes, editableSidecar),
  savePdfExportToFolder: (folderPath, defaultFileName, pdfBytes, editableSidecar) => ipcRenderer.invoke('pdf:exportToFolder', folderPath, defaultFileName, pdfBytes, editableSidecar),
  createMappedFolder: (folderName) => ipcRenderer.invoke('folder:createMapped', folderName),
  deleteDocument: (documentId) => ipcRenderer.invoke('document:delete', documentId)
});
