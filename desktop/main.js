const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { fileURLToPath, pathToFileURL } = require("url");
const { askAssistant } = require("../backend/core/model-router");
const { getOllamaStatus } = require("../backend/providers/ollama");
const { ApprovalStore } = require("../backend/security/approvals");
const { loadEnvironmentConfig } = require("./environment");

let approvalStore;

function createWindow() {
  const entryPath = path.join(__dirname, "../frontend/index.html");
  const entryUrl = pathToFileURL(entryPath).href;
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    title: "SIPOK AI",
    backgroundColor: "#080f1d",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, navigationUrl) => {
    if (navigationUrl !== entryUrl) event.preventDefault();
  });
  win.loadFile(entryPath);
}

function assertTrustedSender(event) {
  const frame = event.senderFrame;
  const expectedPath = path.resolve(__dirname, "../frontend/index.html");

  if (!frame || frame !== event.sender.mainFrame) {
    throw new Error("Requête IPC refusée : frame non autorisée.");
  }

  let senderPath;
  try {
    senderPath = path.resolve(fileURLToPath(frame.url));
  } catch {
    throw new Error("Requête IPC refusée : origine non autorisée.");
  }

  if (senderPath.toLowerCase() !== expectedPath.toLowerCase()) {
    throw new Error("Requête IPC refusée : origine non autorisée.");
  }
}

ipcMain.handle("app:get-info", (event) => {
  assertTrustedSender(event);
  const configuredProvider = ["demo", "ollama", "openai"].includes(process.env.AI_PROVIDER)
    ? process.env.AI_PROVIDER
    : "demo";
  return { name: "SIPOK AI", version: app.getVersion(), defaultProvider: configuredProvider };
});

ipcMain.handle("ollama:get-status", async (event) => {
  assertTrustedSender(event);
  try {
    return await getOllamaStatus({
      baseUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_MODEL
    });
  } catch (error) {
    return {
      ready: false,
      message: error instanceof Error ? error.message : "Impossible de vérifier Ollama."
    };
  }
});

ipcMain.handle("assistant:send-message", async (event, request) => {
  assertTrustedSender(event);
  try {
    const response = await askAssistant(request, process.env, {
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send("assistant:progress", progress);
      }
    });
    if (!event.sender.isDestroyed()) {
      event.sender.send("assistant:progress", { phase: "complete", message: "Réponse terminée." });
    }
    return { ok: true, response };
  } catch (error) {
    if (!event.sender.isDestroyed()) {
      event.sender.send("assistant:progress", { phase: "error", message: "Génération interrompue." });
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "La demande n'a pas pu être traitée."
    };
  }
});

ipcMain.handle("approvals:list", (event) => {
  assertTrustedSender(event);
  return approvalStore.list();
});

ipcMain.handle("approvals:create", (event, draft) => {
  assertTrustedSender(event);
  return approvalStore.create(draft);
});

ipcMain.handle("approvals:resolve", (event, id, decision) => {
  assertTrustedSender(event);
  return approvalStore.resolve(id, decision);
});

app.whenReady().then(() => {
  try {
    loadEnvironmentConfig({
      isPackaged: app.isPackaged,
      userDataPath: app.getPath("userData"),
      projectRoot: path.join(__dirname, "..")
    });
  } catch (error) {
    dialog.showErrorBox("Configuration SIPOK AI", error.message);
    app.quit();
    return;
  }

  approvalStore = new ApprovalStore(path.join(app.getPath("userData"), "approvals.json"));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
