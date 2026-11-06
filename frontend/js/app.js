const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("message");
const conversation = document.getElementById("conversation");
const pageTitle = document.getElementById("pageTitle");
const providerSelect = document.getElementById("provider");
const sendButton = chatForm.querySelector('button[type="submit"]');
const engineStatus = document.getElementById("engineStatus");
const engineIndicator = document.getElementById("engineIndicator");
const approvalForm = document.getElementById("approvalForm");
const approvalList = document.getElementById("approvalList");
const auditList = document.getElementById("auditList");
const approvalMessage = document.getElementById("approvalMessage");
const chatHistory = [];
const progressUnsubscribe = window.sipok.onAssistantProgress((progress) => {
  engineStatus.textContent = progress.message;
  engineIndicator.classList.toggle("offline", progress.phase === "error");
  engineIndicator.classList.toggle("loading", progress.phase === "loading" || progress.phase === "generation");
});

function setApprovalMessage(message, isError = false) {
  approvalMessage.textContent = message;
  approvalMessage.style.color = isError ? "#ff8a8a" : "";
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString("fr-FR");
}

function renderApprovals({ items, events }) {
  approvalList.replaceChildren();
  auditList.replaceChildren();

  if (!items.length) {
    approvalList.appendChild(createTextElement("p", "empty-approvals", "Aucune demande d’approbation."));
  }

  const labels = {
    pending: "En attente",
    approved: "Approuvée",
    rejected: "Refusée"
  };

  items.forEach((item) => {
    const card = createTextElement("article", "approval-card", "");
    const heading = createTextElement("div", "approval-card-heading", "");
    heading.append(
      createTextElement("h4", "", item.title),
      createTextElement("span", `approval-status ${item.status}`, labels[item.status] || "Inconnu")
    );
    card.append(
      heading,
      createTextElement("p", "", item.description),
      createTextElement("p", "approval-meta", `Conséquences : ${item.consequences}`),
      createTextElement("p", "approval-meta", `Ressources : ${item.resources}`),
      createTextElement("p", "approval-meta", `Créée le ${formatTimestamp(item.createdAt)}`)
    );

    if (item.resolvedAt) {
      card.appendChild(createTextElement("p", "approval-meta", `Décision enregistrée le ${formatTimestamp(item.resolvedAt)}.`));
    }

    if (item.status === "pending") {
      const actions = createTextElement("div", "approval-actions", "");
      const approveButton = createTextElement("button", "approve-button", "Autoriser");
      approveButton.type = "button";
      approveButton.addEventListener("click", () => resolveApproval(item.id, "approved"));
      const rejectButton = createTextElement("button", "reject-button", "Refuser");
      rejectButton.type = "button";
      rejectButton.addEventListener("click", () => resolveApproval(item.id, "rejected"));
      actions.append(approveButton, rejectButton);
      card.appendChild(actions);
    }

    approvalList.appendChild(card);
  });

  const itemById = new Map(items.map((item) => [item.id, item]));
  if (!events.length) {
    auditList.appendChild(createTextElement("li", "", "Aucun événement enregistré."));
    return;
  }

  events.forEach((event) => {
    const item = itemById.get(event.approvalId);
    if (!item) return;
    const actionLabels = {
      created: "Demande créée",
      approved: "Demande autorisée",
      rejected: "Demande refusée"
    };
    auditList.appendChild(createTextElement(
      "li",
      "",
      `${formatTimestamp(event.timestamp)} — ${actionLabels[event.action] || "Événement"} : ${item.title}`
    ));
  });
}

async function loadApprovals() {
  try {
    renderApprovals(await window.sipok.listApprovals());
  } catch (error) {
    setApprovalMessage(`Erreur de chargement : ${error.message}`, true);
  }
}

async function resolveApproval(id, decision) {
  try {
    await window.sipok.resolveApproval(id, decision);
    setApprovalMessage(decision === "approved"
      ? "Accord enregistré. Aucune action n’a été exécutée."
      : "Refus enregistré. Aucune action n’a été exécutée.");
    await loadApprovals();
  } catch (error) {
    setApprovalMessage(`Erreur : ${error.message}`, true);
  }
}

function addMessage(role, content) {
  const currentWelcome = conversation.querySelector(".welcome");
  if (currentWelcome) currentWelcome.remove();

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  // textContent prevents user input from being interpreted as HTML.
  bubble.textContent = content;

  row.appendChild(bubble);
  conversation.appendChild(row);
  conversation.scrollTop = conversation.scrollHeight;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  addMessage("user", message);
  messageInput.value = "";
  sendButton.disabled = true;
  providerSelect.disabled = true;
  sendButton.textContent = "Réponse en cours…";

  try {
    const result = await window.sipok.sendMessage({
      message,
      provider: providerSelect.value,
      history: chatHistory.slice(-8)
    });
    if (result.ok) {
      chatHistory.push({ role: "user", content: message }, { role: "assistant", content: result.response });
      addMessage("assistant", result.response);
    } else {
      addMessage("assistant", `Erreur : ${result.error}`);
    }
  } catch (error) {
    addMessage("assistant", `Erreur : ${error.message || "La demande n'a pas pu être traitée."}`);
  } finally {
    sendButton.disabled = false;
    providerSelect.disabled = false;
    sendButton.innerHTML = 'Envoyer <span>➤</span>';
  }
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.prompt || "";
    messageInput.focus();
  });
});

document.getElementById("newChat").addEventListener("click", () => {
  chatHistory.length = 0;
  conversation.innerHTML = "";
  const intro = document.createElement("div");
  intro.className = "welcome";
  intro.innerHTML = '<div class="orb"><span>AI</span></div><p class="eyebrow">NOUVELLE CONVERSATION</p><h2>Comment puis-je vous aider ?</h2><p class="welcome-description">Choisissez un moteur dans le sélecteur pour commencer.</p>';
  conversation.appendChild(intro);
  messageInput.value = "";
});

const views = {
  chat: ["chatView", "Assistant intelligent"],
  memory: ["memoryView", "Mémoire"],
  projects: ["projectsView", "Mes projets"],
  tasks: ["tasksView", "Tâches et validations"],
  settings: ["settingsView", "Paramètres"]
};

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    const [viewId, title] = views[button.dataset.view];
    document.getElementById(viewId).classList.add("active");
    pageTitle.textContent = title;
    if (button.dataset.view === "tasks") loadApprovals();
  });
});

approvalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const draft = {
    title: document.getElementById("approvalTitle").value,
    description: document.getElementById("approvalDescription").value,
    consequences: document.getElementById("approvalConsequences").value,
    resources: document.getElementById("approvalResources").value
  };

  try {
    await window.sipok.createApproval(draft);
    approvalForm.reset();
    setApprovalMessage("Demande enregistrée. Aucune action n’a été exécutée.");
    await loadApprovals();
  } catch (error) {
    setApprovalMessage(`Erreur : ${error.message}`, true);
  }
});

document.getElementById("refreshApprovals").addEventListener("click", loadApprovals);

window.sipok.getOllamaStatus().then((status) => {
  engineStatus.textContent = status.message;
  engineIndicator.classList.toggle("offline", !status.ready);
}).catch((error) => {
  engineStatus.textContent = `État local indisponible : ${error.message}`;
  engineIndicator.classList.add("offline");
});

document.getElementById("aboutButton").addEventListener("click", async () => {
  try {
    const info = await window.sipok.getAppInfo();
    addMessage("assistant", `${info.name} — version ${info.version}. Application de bureau locale.`);
    document.querySelector('[data-view="chat"]').click();
  } catch (error) {
    addMessage("assistant", `Impossible de lire les informations de l'application : ${error.message}`);
  }
});

window.sipok.getAppInfo().then((info) => {
  if (["demo", "ollama", "openai"].includes(info.defaultProvider)) {
    providerSelect.value = info.defaultProvider;
  }
  document.getElementById("versionLabel").textContent = `Version ${info.version} · Backend initial`;
}).catch((error) => {
  document.getElementById("versionLabel").textContent = "Version indisponible";
  console.error("Impossible de charger les informations de l'application.", error);
});

window.addEventListener("beforeunload", () => progressUnsubscribe());
