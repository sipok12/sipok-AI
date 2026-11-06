const { validateChatRequest } = require("../security/validation");
const { generateOpenAIResponse } = require("../providers/openai");
const { generateOllamaResponse } = require("../providers/ollama");

async function askAssistant(request, env = process.env, options = {}) {
  const { message, provider, history } = validateChatRequest(request, env.AI_PROVIDER || "demo");

  if (provider === "demo") {
    return "Mode Démo : votre message a bien été reçu. Aucun modèle IA n'a été appelé et aucune action n'a été effectuée.";
  }

  if (provider === "ollama") {
    return generateOllamaResponse(message, {
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL,
      history,
      onProgress: options.onProgress
    });
  }

  return generateOpenAIResponse(message, {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    history
  });
}

module.exports = { askAssistant };
