const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30000;

async function getProviderError(response) {
  let code;
  try {
    const body = await response.json();
    code = body?.error?.code || body?.error?.type;
  } catch {
    // The status code still provides a useful, safe diagnosis.
  }

  if (response.status === 401) {
    return "OpenAI a refusé la clé API (HTTP 401). Vérifiez OPENAI_API_KEY dans le fichier .env.";
  }
  if (response.status === 403) {
    return "OpenAI a refusé l'accès (HTTP 403). Vérifiez les permissions du projet et l'accès au modèle.";
  }
  if (response.status === 404) {
    return "Le modèle OpenAI demandé est introuvable (HTTP 404). Vérifiez OPENAI_MODEL.";
  }
  if (response.status === 429 && /quota|billing|insufficient_quota/i.test(code || "")) {
    return "Le compte OpenAI n'a plus de quota API disponible (HTTP 429). Vérifiez la facturation et les limites d'utilisation du projet OpenAI.";
  }
  if (response.status === 429) {
    return "OpenAI limite temporairement les requêtes (HTTP 429). Attendez un peu avant de réessayer ou vérifiez les limites de débit.";
  }

  return `OpenAI a répondu avec le statut HTTP ${response.status}. Vérifiez la configuration du fournisseur.`;
}

async function generateOpenAIResponse(message, {
  apiKey,
  model = DEFAULT_MODEL,
  history = [],
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!apiKey) {
    throw new Error("OpenAI n'est pas configuré : définissez OPENAI_API_KEY.");
  }

  let response;
  try {
    response = await fetchImpl(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [...history, { role: "user", content: message }],
        stream: false
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error("La requête OpenAI a dépassé le délai maximal de 30 secondes.");
    }
    throw new Error("Impossible de joindre OpenAI. Vérifiez le réseau et réessayez.");
  }

  if (!response.ok) {
    throw new Error(await getProviderError(response));
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("OpenAI a renvoyé une réponse illisible.");
  }

  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI n'a renvoyé aucun texte exploitable.");
  }

  return content.trim();
}

module.exports = { generateOpenAIResponse, getProviderError };
