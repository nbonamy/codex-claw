<p align="center">
   <img src="assets/icon.png" width="128" height="128" alt="Icône de l'application Codex Claw" />
</p>

# Codex Claw

Rencontrez votre équipe native de codage avec Codex. Codex Claw est une
application de bureau qui vous permet de lancer une équipe d'agents Codex,
chacun avec son propre dossier, son identité, son fil, ses outils et sa boîte
de réception, tout en affichant le travail comme une vraie application plutôt
qu'un flux de terminal.

![Electron](https://img.shields.io/badge/Electron-42+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-3178c6)
![Licence](https://img.shields.io/badge/Licence-Apache--2.0-green)

## Pourquoi Codex Claw

- **On dirait une salle d'équipe :** équipes, agents, avatars, dossiers,
  statuts et modèles Bench restent visibles et organisés.
- **Rendu Codex natif :** messages, appels d'outils, sortie de commandes,
  approbations, questions, plans, modifications de fichiers, statistiques de
  diff et Markdown s'affichent comme une interface d'application.
- **Vraiment collaboratif :** le MCP intégré permet aux agents de s'enregistrer,
  définir leur statut, lister leurs coéquipiers, envoyer des messages, diffuser
  des annonces et consulter leur boîte de réception.
- **Pensé pour le flux de codage :** mettez des prompts en file d'attente,
  orientez les tours actifs, interrompez le travail, mentionnez des fichiers,
  déclenchez des skills, dictez des prompts et gardez l'état du contexte et des
  limites de débit sous les yeux.

## Fonctionnalités

- **Gestion des équipes et agents** - Créez des équipes, ajoutez des agents
  Codex, modifiez les avatars, déplacez les agents entre équipes, dupliquez,
  redémarrez, fermez et persistez le tout.
- **Modèles Bench** - Enregistrez les bons agents comme modèles réutilisables et
  redéployez-les dans une équipe.
- **Surface de chat native** - Diffusez le texte assistant, les parties de
  message ordonnées, le code avec coloration syntaxique, les liens, les groupes
  d'outils, les journaux de commandes et les résumés de changements de fichiers.
- **Modes plan et objectif** - Activez le mode plan de Codex, lancez des tours
  orientés objectif et traitez les mises à jour de mode de l'app-server.
- **Communication entre agents** - Serveur Claw MCP local avec des outils de
  collaboration inspirés de Skwad.
- **Superpouvoirs du composeur** - Sélecteur de modèle et de raisonnement,
  prompts en file, pilotage du tour actif, commandes slash, recherche de skills,
  mentions de fichiers, affordances de pièces jointes et dictée macOS.
- **Conscience de l'exécution** - Jauge de fenêtre de contexte, limites de débit
  du compte, statut du backend, statut de l'agent, reprise de l'historique des
  fils et squelettes de chargement.

## Blague française obligatoire

Pourquoi un agent Codex français ne merge jamais avant la revue de code ?
Parce qu'il faut d'abord vérifier que chaque fonction a du panache.

## Prérequis

- Un environnement de développement macOS récent.
- Node.js compatible avec la chaîne d'outils Electron Forge/Vite.
- Accès à un binaire Codex app-server.

Codex Claw peut utiliser un répertoire Codex isolé via
`CODEX_CLAW_CODEX_HOME` et reprend les sessions d'agents persistées quand c'est
possible.

## Développement

```bash
npm install
npm run dev
```

Commandes de vérification utiles :

```bash
npm test
npm run test:coverage
npm run lint
npm run build
```

Le packaging macOS signe et notarise par défaut. Pour les vérifications locales
de packaging qui n'ont pas besoin de signature de publication :

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run build
CODEX_CLAW_SKIP_SIGNING=1 npm run package
```

## Architecture

Codex Claw conserve les détails du protocole Codex dans Electron main :

```text
Interface renderer -> IPC preload typé -> Electron main -> driver backend -> Codex app-server
```

Le renderer consomme des événements appartenant à l'application et des parties
`RendererMessage`. Codex est le backend implémenté aujourd'hui, avec une
jonction backend étroite prête pour un futur driver Claude Code.

## Documentation

- [AGENTS.md](AGENTS.md) - règles du dépôt pour les agents travaillant sur Codex
  Claw
- [docs/architecture.md](docs/architecture.md) - architecture produit et
  processus
- [docs/codex.md](docs/codex.md) - notes sur le protocole Codex app-server
- [docs/mcp.md](docs/mcp.md) - serveur de collaboration Claw MCP
- [docs/frontend.md](docs/frontend.md) - principes du renderer et du thème
- [docs/testing.md](docs/testing.md) - stratégie de test et niveau de
  couverture
- [plans/codex-claw.md](plans/codex-claw.md) - progression produit

## Licence

Apache-2.0. Voir [LICENSE](LICENSE).
