const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { askAssistant } = require("../backend/core/model-router");
const { validateChatRequest } = require("../backend/security/validation");
const {
  validateOllamaBaseUrl,
  generateOllamaResponse,
  getOllamaStatus
} = require("../backend/providers/ollama");
const { generateOpenAIResponse } = require("../backend/providers/openai");
const { ApprovalStore } = require("../backend/security/approvals");
const { loadEnvironmentConfig } = require("../desktop/environment");

function createApprovalStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sipok-approvals-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new ApprovalStore(path.join(directory, "approvals.json"));
}

test("validates and normalizes a chat request", () => {
  assert.deepEqual(validateChatRequest({
    message: "  Bonjour  ",
    provider: "demo"
  }), {
    message: "Bonjour",
    provider: "demo",
    history: []
  });
});

test("uses the configured default provider and bounds conversation history", () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `message-${index}`
  }));
  const request = validateChatRequest({ message: "suite", history }, "ollama");

  assert.equal(request.provider, "ollama");
  assert.deepEqual(request.history.map((entry) => entry.content), [
    "message-2", "message-3", "message-4", "message-5",
    "message-6", "message-7", "message-8", "message-9"
  ]);
});

test("keeps recent conversation history within a character budget", () => {
  const request = validateChatRequest({
    message: "suite",
    history: [
      { role: "user", content: "a".repeat(3000) },
      { role: "assistant", content: "b".repeat(3000) },
      { role: "user", content: "c".repeat(3000) }
    ]
  });

  assert.deepEqual(request.history.map((entry) => entry.content[0]), ["b", "c"]);
  assert.ok(request.history.reduce((total, entry) => total + entry.content.length, 0) <= 6000);
});

test("rejects empty messages and unapproved providers", () => {
  assert.throws(() => validateChatRequest({ message: " ", provider: "demo" }), /vide/);
  assert.throws(() => validateChatRequest({ message: "salut", provider: "shell" }), /pas autorisé/);
  assert.throws(() => validateChatRequest({
    message: "salut",
    provider: "demo",
    history: [{ role: "system", content: "instruction" }]
  }), /historique/);
});

test("demo mode does not call an AI provider", async () => {
  const response = await askAssistant({ message: "Bonjour", provider: "demo" });
  assert.match(response, /Aucun modèle IA n'a été appelé/);
});

test("requires explicit OpenAI credentials", async () => {
  await assert.rejects(
    askAssistant({ message: "Bonjour", provider: "openai" }, {}),
    /OPENAI_API_KEY/
  );
});

test("respects the configured provider and does not silently fall back", async () => {
  await assert.rejects(
    askAssistant({ message: "Bonjour" }, { AI_PROVIDER: "openai" }),
    /OPENAI_API_KEY/
  );
});

test("restricts Ollama to local loopback addresses", () => {
  assert.equal(validateOllamaBaseUrl("http://127.0.0.1:11434").hostname, "127.0.0.1");
  assert.equal(validateOllamaBaseUrl("http://[::1]:11434").hostname, "[::1]");
  assert.equal(validateOllamaBaseUrl("http://localhost:11434").hostname, "localhost");
  assert.throws(() => validateOllamaBaseUrl("http://example.com:11434"), /adresse HTTP locale/);
  assert.throws(() => validateOllamaBaseUrl("https://localhost:11434"), /adresse HTTP locale/);
});

test("sends an Ollama request only to the configured local endpoint", async () => {
  let calledUrl;
  let calledBody;
  const response = await generateOllamaResponse("Bonjour", {
    baseUrl: "http://localhost:11434",
    model: "qwen2.5:0.5b",
    history: [{ role: "assistant", content: "Bonjour !" }],
    fetchImpl: async (url, options) => {
      calledUrl = String(url);
      calledBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ message: { content: "Bonjour !" } }) };
    }
  });

  assert.equal(calledUrl, "http://localhost:11434/api/chat");
  assert.equal(calledBody.model, "qwen2.5:0.5b");
  assert.equal(calledBody.stream, true);
  assert.equal(calledBody.messages.length, 2);
  assert.deepEqual(calledBody.options, { num_ctx: 2048, num_predict: 384 });
  assert.equal(response, "Bonjour !");
});

test("parses Ollama streaming responses and reports generation state", async () => {
  const chunks = [
    '{"message":{"content":"Bonjour"},"done":false}\n',
    '{"message":{"content":" !"},"done":true}\n'
  ];
  let index = 0;
  const phases = [];
  const response = await generateOllamaResponse("Salut", {
    model: "qwen2.5:0.5b",
    onProgress: ({ phase }) => phases.push(phase),
    fetchImpl: async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => index < chunks.length
            ? { value: Buffer.from(chunks[index++]), done: false }
            : { value: undefined, done: true }
        })
      }
    })
  });

  assert.equal(response, "Bonjour !");
  assert.deepEqual(phases, ["loading", "generation"]);
});

test("reports an Ollama server without the configured Qwen model", async () => {
  const status = await getOllamaStatus({
    baseUrl: "http://localhost:11434",
    model: "qwen2.5:0.5b",
    fetchImpl: async () => ({ ok: true, json: async () => ({ models: [] }) })
  });

  assert.equal(status.ready, false);
  assert.equal(status.state, "model-unavailable");
  assert.match(status.message, /qwen2.5:0.5b/);
});

test("reports an Ollama outage instead of returning a successful fallback", async () => {
  await assert.rejects(
    generateOllamaResponse("Bonjour", {
      model: "qwen2.5:0.5b",
      fetchImpl: async () => {
        const error = new TypeError("fetch failed");
        throw error;
      }
    }),
    /Impossible de joindre Ollama/
  );
});

test("detects an installed Ollama model for local-first startup", async () => {
  const status = await getOllamaStatus({
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2",
    fetchImpl: async (url) => {
      assert.equal(String(url), "http://127.0.0.1:11434/api/tags");
      return { ok: true, json: async () => ({ models: [{ name: "llama3.2:latest" }] }) };
    }
  });

  assert.equal(status.ready, true);
});

test("reports an unavailable Ollama model without selecting cloud fallback", async () => {
  const status = await getOllamaStatus({
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2",
    fetchImpl: async () => { throw new Error("offline"); }
  });

  assert.equal(status.ready, false);
  assert.match(status.message, /pas démarré/);
});

test("sends OpenAI requests to the fixed API endpoint with its configured key", async () => {
  let requestUrl;
  let authorization;
  async function fetchMock(url, options) {
    requestUrl = String(url);
    authorization = options.headers.Authorization;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: " Réponse test. " } }] })
    };
  }

  const mockedResponse = await generateOpenAIResponse("Bonjour", {
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: fetchMock
  });
  assert.equal(requestUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(authorization, "Bearer test-key");
  assert.equal(mockedResponse, "Réponse test.");
});

test("explains OpenAI quota exhaustion separately from temporary rate limits", async () => {
  const quotaFetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { code: "insufficient_quota" } })
  });
  const rateLimitFetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { code: "rate_limit_exceeded" } })
  });

  await assert.rejects(
    generateOpenAIResponse("Bonjour", { apiKey: "test-key", fetchImpl: quotaFetch }),
    /n'a plus de quota API disponible/
  );
  await assert.rejects(
    generateOpenAIResponse("Bonjour", { apiKey: "test-key", fetchImpl: rateLimitFetch }),
    /limite temporairement les requêtes/
  );
});

test("persists approval requests, decisions and audit events", (t) => {
  const store = createApprovalStore(t);
  const item = store.create({
    title: "Créer un fichier",
    description: "Créer un fichier dans le dossier du projet.",
    consequences: "Un nouveau fichier sera ajouté.",
    resources: "Dossier du projet"
  });

  const reopenedStore = new ApprovalStore(store.filePath);
  assert.equal(reopenedStore.list().items[0].status, "pending");
  assert.equal(reopenedStore.resolve(item.id, "approved").status, "approved");

  const state = reopenedStore.list();
  assert.equal(state.items[0].status, "approved");
  assert.deepEqual(state.events.map((event) => event.action), ["approved", "created"]);
});

test("rejects incomplete approval requests and duplicate decisions", (t) => {
  const store = createApprovalStore(t);
  assert.throws(() => store.create({
    title: "   ",
    description: "Description",
    consequences: "Conséquences",
    resources: "Ressources"
  }), /obligatoire/);

  const item = store.create({
    title: "Demande",
    description: "Description",
    consequences: "Conséquences",
    resources: "Ressources"
  });
  store.resolve(item.id, "rejected");
  assert.throws(() => store.resolve(item.id, "approved"), /déjà été traitée/);
});

test("does not overwrite a corrupted approval journal", (t) => {
  const store = createApprovalStore(t);
  fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
  fs.writeFileSync(store.filePath, "{", "utf8");

  assert.throws(() => store.list(), /illisible/);
  assert.equal(fs.readFileSync(store.filePath, "utf8"), "{");
});

test("loads a packaged app config from user data without exposing values", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sipok-config-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, ".env"), "OPENAI_API_KEY=private-test-value\nOLLAMA_MODEL=local-model\n");
  const env = { KEEP_EXISTING: "already-set" };

  const result = loadEnvironmentConfig({
    isPackaged: true,
    userDataPath: directory,
    projectRoot: path.join(directory, "ignored"),
    env
  });

  assert.deepEqual(result.variableNames.sort(), ["OLLAMA_MODEL", "OPENAI_API_KEY"]);
  assert.equal(env.OPENAI_API_KEY, "private-test-value");
  assert.equal(env.KEEP_EXISTING, "already-set");
});

test("does not load project secrets into a packaged app", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sipok-packaged-config-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const projectRoot = path.join(directory, "project");
  const userDataPath = path.join(directory, "user-data");
  fs.mkdirSync(projectRoot);
  fs.mkdirSync(userDataPath);
  fs.writeFileSync(path.join(projectRoot, ".env"), "OPENAI_API_KEY=project-only\n");
  const env = {};

  const result = loadEnvironmentConfig({
    isPackaged: true,
    userDataPath,
    projectRoot,
    env
  });

  assert.equal(result, null);
  assert.equal(env.OPENAI_API_KEY, undefined);
});
