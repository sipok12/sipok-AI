const MAX_MESSAGE_LENGTH = 8000;
const ALLOWED_PROVIDERS = new Set(["demo", "ollama", "openai"]);
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_CHARACTERS = 6000;

function validateChatRequest(request, defaultProvider = "demo") {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("La demande doit être un objet valide.");
  }

  if (typeof request.message !== "string") {
    throw new TypeError("Le message doit être du texte.");
  }

  const message = request.message.trim();
  if (!message) {
    throw new TypeError("Le message ne peut pas être vide.");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new RangeError(`Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`);
  }
  const provider = request.provider === undefined ? defaultProvider : request.provider;
  if (!ALLOWED_PROVIDERS.has(provider)) {
    throw new TypeError("Le fournisseur demandé n'est pas autorisé.");
  }

  if (request.history !== undefined && !Array.isArray(request.history)) {
    throw new TypeError("L'historique de conversation doit être une liste valide.");
  }

  const validatedHistory = (request.history || []).slice(-MAX_HISTORY_MESSAGES).map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !["user", "assistant"].includes(entry.role) ||
      typeof entry.content !== "string" ||
      !entry.content.trim() ||
      entry.content.length > MAX_HISTORY_MESSAGE_LENGTH
    ) {
      throw new TypeError("Un message de l'historique est invalide.");
    }

    return { role: entry.role, content: entry.content.trim() };
  });
  let historyCharacters = 0;
  const history = [];
  for (const entry of validatedHistory.reverse()) {
    if (historyCharacters + entry.content.length > MAX_HISTORY_CHARACTERS) break;
    history.unshift(entry);
    historyCharacters += entry.content.length;
  }

  return { message, provider, history };
}

module.exports = {
  MAX_HISTORY_MESSAGE_LENGTH,
  MAX_HISTORY_CHARACTERS,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_LENGTH,
  validateChatRequest
};
