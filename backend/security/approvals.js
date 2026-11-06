const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const FIELD_LIMITS = {
  title: 120,
  description: 2000,
  consequences: 1000,
  resources: 500
};

function validateDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new TypeError("La demande d'approbation doit être un objet valide.");
  }

  const normalized = {};
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (typeof draft[field] !== "string") {
      throw new TypeError(`Le champ « ${field} » doit être du texte.`);
    }

    normalized[field] = draft[field].trim();
    if (!normalized[field]) {
      throw new TypeError(`Le champ « ${field} » est obligatoire.`);
    }
    if (normalized[field].length > limit) {
      throw new RangeError(`Le champ « ${field} » ne peut pas dépasser ${limit} caractères.`);
    }
  }

  return normalized;
}

function isValidTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isValidState(state) {
  if (
    !state ||
    state.version !== 1 ||
    !Array.isArray(state.items) ||
    !Array.isArray(state.events)
  ) {
    return false;
  }

  const itemIds = new Set();
  for (const item of state.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      itemIds.has(item.id) ||
      !Object.entries(FIELD_LIMITS).every(([field, limit]) =>
        typeof item[field] === "string" && item[field].length > 0 && item[field].length <= limit
      ) ||
      !["pending", "approved", "rejected"].includes(item.status) ||
      !isValidTimestamp(item.createdAt) ||
      (item.status === "pending" ? item.resolvedAt !== null : !isValidTimestamp(item.resolvedAt))
    ) {
      return false;
    }
    itemIds.add(item.id);
  }

  const eventIds = new Set();
  const eventsByApproval = new Map();
  const validEvents = state.events.every((event) => {
    if (
      !event ||
      typeof event.id !== "string" ||
      !event.id ||
      eventIds.has(event.id) ||
      !itemIds.has(event.approvalId) ||
      !["created", "approved", "rejected"].includes(event.action) ||
      !isValidTimestamp(event.timestamp)
    ) {
      return false;
    }
    eventIds.add(event.id);
    const approvalEvents = eventsByApproval.get(event.approvalId) || [];
    approvalEvents.push(event);
    eventsByApproval.set(event.approvalId, approvalEvents);
    return true;
  });

  if (!validEvents) return false;

  return state.items.every((item) => {
    const approvalEvents = eventsByApproval.get(item.id) || [];
    const creationEvents = approvalEvents.filter((event) => event.action === "created");
    const decisionEvents = approvalEvents.filter((event) => event.action !== "created");
    if (creationEvents.length !== 1 || creationEvents[0].timestamp !== item.createdAt) return false;
    if (item.status === "pending") return decisionEvents.length === 0;
    return decisionEvents.length === 1 &&
      decisionEvents[0].action === item.status &&
      decisionEvents[0].timestamp === item.resolvedAt;
  });
}

class ApprovalStore {
  constructor(filePath, { now = () => new Date().toISOString(), createId = randomUUID } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.createId = createId;
  }

  list() {
    const state = this.readState();
    return {
      items: [...state.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      events: [...state.events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    };
  }

  create(draft) {
    const fields = validateDraft(draft);
    const state = this.readState();
    const item = {
      id: this.createId(),
      ...fields,
      status: "pending",
      createdAt: this.now(),
      resolvedAt: null
    };

    state.items.push(item);
    state.events.push({
      id: this.createId(),
      approvalId: item.id,
      action: "created",
      timestamp: item.createdAt
    });
    this.writeState(state);
    return item;
  }

  resolve(id, decision) {
    if (typeof id !== "string" || !id) {
      throw new TypeError("L'identifiant de la demande est invalide.");
    }
    if (decision !== "approved" && decision !== "rejected") {
      throw new TypeError("La décision doit être « approved » ou « rejected ».");
    }

    const state = this.readState();
    const item = state.items.find((approval) => approval.id === id);
    if (!item) {
      throw new Error("Cette demande d'approbation n'existe pas.");
    }
    if (item.status !== "pending") {
      throw new Error("Cette demande a déjà été traitée.");
    }

    item.status = decision;
    item.resolvedAt = this.now();
    state.events.push({
      id: this.createId(),
      approvalId: item.id,
      action: decision,
      timestamp: item.resolvedAt
    });
    this.writeState(state);
    return item;
  }

  readState() {
    let contents;
    try {
      contents = fs.readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return { version: 1, items: [], events: [] };
      }
      throw new Error("Impossible de lire le journal des approbations.", { cause: error });
    }

    let state;
    try {
      state = JSON.parse(contents);
    } catch (error) {
      throw new Error("Le journal des approbations est illisible; aucune donnée n'a été remplacée.", { cause: error });
    }

    if (!isValidState(state)) {
      throw new Error("Le journal des approbations a un format invalide; aucune donnée n'a été remplacée.");
    }

    return state;
  }

  writeState(state) {
    const directory = path.dirname(this.filePath);
    const temporaryPath = path.join(directory, `.${path.basename(this.filePath)}.${this.createId()}.tmp`);

    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { encoding: "utf8", flag: "wx" });
      fs.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw new Error("Impossible d'enregistrer le journal des approbations.", { cause: error });
    }
  }
}

module.exports = { ApprovalStore, isValidState, validateDraft };
