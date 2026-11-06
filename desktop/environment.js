const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function loadEnvironmentConfig({ isPackaged, userDataPath, projectRoot, env = process.env }) {
  const candidates = [path.join(userDataPath, ".env")];
  if (!isPackaged) candidates.push(path.join(projectRoot, ".env"));

  for (const filePath of candidates) {
    let contents;
    try {
      contents = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw new Error("Impossible de lire le fichier de configuration SIPOK AI.", { cause: error });
    }

    let parsed;
    try {
      parsed = dotenv.parse(contents);
    } catch (error) {
      throw new Error("Le fichier de configuration SIPOK AI est invalide.", { cause: error });
    }

    for (const [name, value] of Object.entries(parsed)) {
      if (env[name] === undefined) env[name] = value;
    }

    return { path: filePath, variableNames: Object.keys(parsed) };
  }

  return null;
}

module.exports = { loadEnvironmentConfig };
