# SIPOK AI Desktop

Socle initial d'une application d'assistant IA personnel pour Windows.

## Prérequis

- Windows 10 ou Windows 11
- Node.js LTS et npm
- Visual Studio Code (facultatif)

## Installation

Ouvrir PowerShell dans ce dossier, puis exécuter :

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

Une fenêtre SIPOK AI doit s'ouvrir. Le chat propose trois modes : Démo, Ollama local et OpenAI (cloud). Le fournisseur par défaut est défini par `AI_PROVIDER`; il peut toujours être changé depuis le sélecteur. Le mode Démo ne contacte aucun service.

## Fournisseurs IA

Les appels aux modèles sont exécutés dans le processus principal Electron; aucune clé API n'est accessible au frontend. En développement, SIPOK AI charge le fichier `.env` à la racine du projet. Dans l'application installée, placez votre `.env` dans `%APPDATA%\sipok-ai-desktop\.env` (par exemple `C:\Users\VotreNom\AppData\Roaming\sipok-ai-desktop\.env`). Le fichier `.env` n'est jamais inclus dans l'installateur. Les variables déjà définies dans l'environnement du processus restent prioritaires. Le fichier `.env.example` est un aide-mémoire, pas une configuration active.

Pour OpenAI dans PowerShell, par exemple :

```powershell
$env:OPENAI_API_KEY = "votre-cle"
$env:OPENAI_MODEL = "gpt-4o-mini"
npm.cmd start
```

Choisissez ensuite explicitement **OpenAI (cloud)** dans le chat. Le contenu du message sera transmis à OpenAI. SIPOK AI ne bascule pas automatiquement du mode local vers le cloud.

La configuration locale par défaut est `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://localhost:11434` et `OLLAMA_MODEL=qwen2.5:0.5b`. Installez Ollama pour Windows, démarrez-le, puis téléchargez le modèle dans PowerShell :

```powershell
ollama pull qwen2.5:0.5b
```

Les variables peuvent aussi être conservées dans le `.env` du projet en développement, ou dans `%APPDATA%\sipok-ai-desktop\.env` pour l'application installée. Les adresses Ollama non locales ou non-HTTP sont refusées. SIPOK AI utilise `/api/chat` avec un historique limité à huit messages et 6000 caractères, un contexte de 2048 tokens, une génération plafonnée à 384 tokens et une seule génération locale simultanée. L'interface affiche la vérification de connexion, le chargement du modèle et la génération.

Au démarrage, SIPOK AI vérifie le serveur et le modèle Ollama local. Si le serveur ou le modèle est indisponible, le problème est signalé dans l'interface et aucune bascule automatique vers OpenAI n'a lieu. Pour utiliser le fournisseur cloud, configurez `OPENAI_API_KEY` dans le `.env` et sélectionnez explicitement **OpenAI (cloud)**. Aucune clé API n'est transmise au frontend.

Si OpenAI renvoie HTTP 429, SIPOK AI distingue une limite de débit temporaire d'un quota API épuisé. Un quota épuisé doit être rétabli dans les paramètres de facturation et d'utilisation du projet OpenAI; l'application ne peut pas augmenter ce quota.

## Générer un installateur Windows

Après avoir installé les dépendances :

```powershell
npm.cmd run dist
```

Le résultat sera placé dans `release/`.

## Périmètre actuel

- Supabase, la mémoire persistante, les outils informatiques et les permissions granulaires ne sont pas encore implémentés.
- Aucun accès aux fichiers ni exécution de commandes système n'est fourni.
- La configuration par l'interface et le stockage sécurisé persistant des identifiants restent à réaliser.

### File d'approbations locale

L'onglet **Tâches** permet de créer une demande et d'enregistrer explicitement une décision Autoriser/Refuser. Les demandes et événements sont conservés dans le dossier utilisateur de SIPOK AI. Cette fonction ne lance ni ne modifie aucun fichier, commande ou service : elle constitue le socle de journalisation, pas encore un mécanisme branché à des outils exécutables. Le journal local n'est pas inviolable.

## Sécurité

- `contextIsolation` est activé.
- `nodeIntegration` est désactivé.
- Le frontend passe par une API limitée dans `desktop/preload.js`; les requêtes IPC sont limitées à la fenêtre locale.
- Les requêtes vers les modèles ont un délai maximal et des entrées validées.
- Ollama est limité au loopback. La sélection OpenAI est explicite et transmet le message au fournisseur cloud.
- Les outils système, les accès aux fichiers et les actions sensibles ne sont pas implémentés.

## Prochaines étapes

1. Ajouter des tests d'intégration Electron et vérifier le lancement empaqueté.
2. Ajouter une configuration sécurisée et persistante des fournisseurs.
3. Ajouter la mémoire Supabase avec RLS et des politiques testées.
4. Relier la file d'approbation aux futurs outils, sans exécuter une action avant une autorisation explicite.
5. Ajouter la voix (transcription et synthèse vocale).
