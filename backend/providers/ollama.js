const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const REQUEST_TIMEOUT_MS = 180000;
const MAX_RESPONSE_TOKENS = 384;
const MAX_CONTEXT_TOKENS = 2048;
const MAX_HISTORY_MESSAGES = 8;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
let requestInProgress = false;

function validateOllamaBaseUrl(baseUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl || DEFAULT_BASE_URL);
  } catch {
    throw new Error("OLLAMA_BASE_URL doit être une URL valide.");
  }

  if (
    parsedUrl.protocol !== "http:" ||
    !LOCAL_HOSTS.has(parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "")) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("Ollama doit être accessible via une adresse HTTP locale (loopback) uniquement.");
  }

  return parsedUrl;
}

async function generateOllamaResponse(message, {
  baseUrl = DEFAULT_BASE_URL,
  model,
  history = [],
  onProgress = () => {},
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!model) {
    throw new Error("Ollama n'est pas configuré : définissez OLLAMA_MODEL.");
  }
  if (requestInProgress) {
    throw new Error("Une autre génération Ollama est déjà en cours. Attendez sa fin avant de réessayer.");
  }

  const parsedUrl = validateOllamaBaseUrl(baseUrl);
  const endpoint = new URL("api/chat", `${parsedUrl.href.replace(/\/+$/, "")}/`);
  const messages = [...history.slice(-MAX_HISTORY_MESSAGES), { role: "user", content: message }];
  requestInProgress = true;

  let response;
  try {
    onProgress({ phase: "loading", message: `Chargement de ${model}…` });
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        keep_alive: "5m",
        options: {
          num_ctx: MAX_CONTEXT_TOKENS,
          num_predict: MAX_RESPONSE_TOKENS
        }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Ollama a répondu avec le statut HTTP ${response.status}. Vérifiez que le modèle ${model} est installé.`);
    }

    if (!response.body?.getReader) {
      const result = await response.json();
      const content = result?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Ollama n'a renvoyé aucun texte exploitable.");
      }
      onProgress({ phase: "generation", message: "Génération en cours…" });
      return content.trim();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let generationStarted = false;
    let done = false;

    const processLine = (line) => {
      if (!line.trim()) return false;
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        throw new Error("Ollama a renvoyé un flux de réponse illisible.");
      }
      if (chunk.error) throw new Error(`Ollama : ${chunk.error}`);
      if (typeof chunk.message?.content === "string") {
        if (!generationStarted) {
          generationStarted = true;
          onProgress({ phase: "generation", message: "Génération en cours…" });
        }
        content += chunk.message.content;
      }
      return chunk.done === true;
    };

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !streamDone });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (processLine(line)) done = true;
      }
      if (streamDone) {
        if (buffer.trim()) processLine(buffer);
        done = true;
      }
    }

    if (!content.trim()) {
      throw new Error("Ollama n'a renvoyé aucun texte exploitable.");
    }
    return content.trim();
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error("La génération Ollama a dépassé le délai maximal de 180 secondes.");
    }
    if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
      throw new Error("Impossible de joindre Ollama en local. Vérifiez qu'Ollama est lancé et réessayez.");
    }
    throw error;
  } finally {
    requestInProgress = false;
  }
}

async function getOllamaStatus({
  baseUrl = DEFAULT_BASE_URL,
  model,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000
}) {
  if (!model) {
    return { ready: false, state: "disconnected", message: "Ollama n'est pas configuré : définissez OLLAMA_MODEL." };
  }

  const parsedUrl = validateOllamaBaseUrl(baseUrl);
  const endpoint = new URL("api/tags", `${parsedUrl.href.replace(/\/+$/, "")}/`);

  let response;
  try {
    response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { ready: false, state: "disconnected", message: "Ollama n'est pas démarré sur cet ordinateur." };
  }

  if (!response.ok) {
    return { ready: false, state: "disconnected", message: `Ollama a répondu avec le statut HTTP ${response.status}.` };
  }

  let result;
  try {
    result = await response.json();
  } catch {
    return { ready: false, state: "disconnected", message: "Ollama a renvoyé un état illisible." };
  }

  const models = Array.isArray(result?.models) ? result.models : [];
  const normalizedModel = model.includes(":") ? model : `${model}:latest`;
  const installed = models.some((item) =>
    typeof item?.name === "string" &&
    (item.name === model || item.name === normalizedModel)
  );

  if (!installed) {
    return {
      ready: false,
      state: "model-unavailable",
      message: `Le modèle ${model} n'est pas téléchargé dans Ollama.`
    };
  }

  return {
    ready: true,
    state: "connected",
    message: `Ollama connecté · ${model} disponible.`
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  MAX_CONTEXT_TOKENS,
  MAX_HISTORY_MESSAGES,
  MAX_RESPONSE_TOKENS,
  generateOllamaResponse,
  getOllamaStatus,
  validateOllamaBaseUrl
};
