# Backend initial

Le premier backend relie le chat Electron au routeur de modèles via une API IPC limitée.

- `core/model-router.js` : sélection explicite du mode Démo, Ollama ou OpenAI.
- `providers/` : appels HTTP vers les API des modèles, exécutés uniquement dans le processus principal Electron.
- `security/validation.js` : validation des demandes reçues du frontend.
- `security/approvals.js` : demandes d'approbation et journal local de décisions, enregistrés dans le dossier utilisateur de l'application.

Le mode Démo est sélectionné par défaut. Ollama est limité aux adresses loopback. OpenAI n'est appelé que lorsque l'utilisateur choisit ce fournisseur et qu'une clé est configurée. Aucun fournisseur ne sert de repli automatique pour un autre.

Les approbations enregistrent une décision de l'utilisateur mais n'exécutent aucune action. Le journal est local et n'est pas inviolable.

Aucun outil de fichiers, d'exécution de commandes, de mémoire Supabase ou d'action autonome n'est exposé.
