const { contextBridge, ipcRenderer } = require("electron");

// Seules les fonctions explicitement exposées ici sont accessibles au frontend.
contextBridge.exposeInMainWorld("sipok", {
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  getOllamaStatus: () => ipcRenderer.invoke("ollama:get-status"),
  sendMessage: (request) => ipcRenderer.invoke("assistant:send-message", request),
  onAssistantProgress: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Un callback de progression est requis.");
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("assistant:progress", listener);
    return () => ipcRenderer.removeListener("assistant:progress", listener);
  },
  listApprovals: () => ipcRenderer.invoke("approvals:list"),
  createApproval: (draft) => ipcRenderer.invoke("approvals:create", draft),
  resolveApproval: (id, decision) => ipcRenderer.invoke("approvals:resolve", id, decision)
});
