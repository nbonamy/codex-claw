<p align="center">
   <img src="assets/icon.png" width="128" height="128" alt="Icône de l'app Codex Claw" />
</p>

# Codex Claw

Voici votre équipe Codex native, prête à bosser. Codex Claw est une app desktop
qui permet de faire tourner une vraie team d'agents Codex, chacun avec son
dossier, son identité, son fil, ses outils et sa boîte de réception, tout ça
dans une interface d'app propre plutôt qu'un flux de terminal brut de décoffrage.

![Electron](https://img.shields.io/badge/Electron-42+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-3178c6)
![License](https://img.shields.io/badge/License-Apache--2.0-green)

## Pourquoi Codex Claw

- **Ça ressemble à une salle d'équipe:** teams, agents, avatars, dossiers,
  statuts et templates Bench restent visibles, rangés, nickel.
- **Rendu Codex natif:** messages, appels d'outils, sorties de commandes,
  validations, questions, plans, modifications de fichiers, stats de diff et
  Markdown s'affichent comme de la vraie UI d'app.
- **Collaboration pour de vrai:** le MCP intégré permet aux agents de
  s'enregistrer, définir leur statut, lister les collègues, envoyer des
  messages, diffuser à tout le monde et checker leur inbox.
- **Taillé pour le flow de code:** empile les prompts, pilote les tours actifs,
  interrompt le taf, mentionne des fichiers, déclenche des skills, dicte tes
  prompts et garde le contexte comme les limites de débit sous les yeux.

## Fonctionnalités

- **Gestion des teams et des agents** - Crée des teams, ajoute des agents
  Codex, change leurs avatars, déplace-les entre teams, duplique, redémarre,
  ferme et persiste tout le bazar proprement.
- **Templates Bench** - Sauvegarde les bons agents comme templates réutilisables
  et redéploie-les dans une team quand il faut remettre les gaz.
- **Surface de chat native** - Streame le texte assistant, les morceaux de
  messages ordonnés, le code avec coloration syntaxique, les liens, groupes
  d'outils, logs de commandes et résumés de changements de fichiers.
- **Modes plan et objectif** - Active le mode plan Codex, lance des tours
  orientés objectif et traite les mises à jour de mode de l'app-server.
- **Communication agent à agent** - Serveur MCP local Claw avec des outils de
  collaboration façon Skwad.
- **Super-pouvoirs du composer** - Sélecteur modèle/raisonnement, prompts en
  file d'attente, pilotage du tour actif, slash commands, recherche de skills,
  mentions de fichiers, affordances d'attachement et dictée macOS.
- **Conscience du runtime** - Jauge de fenêtre de contexte, limites de compte,
  statut backend, statut agent, reprise d'historique de thread et skeletons de
  chargement.

## Prérequis

- Un environnement de développement macOS récent.
- Node.js compatible avec la toolchain Electron Forge/Vite.
- Accès à un binaire Codex app-server.

Codex Claw peut utiliser un home Codex isolé via `CODEX_CLAW_CODEX_HOME` et
reprend les sessions d'agents persistées quand c'est possible.

## Développement

```bash
npm install
npm run dev
```

Commandes de vérification utiles:

```bash
npm test
npm run test:coverage
npm run lint
npm run build
```

Le packaging macOS signe et notarise par défaut. Pour les checks locaux qui
n'ont pas besoin de signature de release:

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run build
CODEX_CLAW_SKIP_SIGNING=1 npm run package
```

## Architecture

Codex Claw garde les détails du protocole Codex dans Electron main:

```text
Renderer UI -> typed preload IPC -> Electron main -> backend driver -> Codex app-server
```

Le renderer consomme des événements appartenant à l'app et des morceaux
`RendererMessage`. Codex est le backend implémenté aujourd'hui, avec une
couche backend bien nette et déjà prête pour un futur driver Claude Code.

## Documentation

- [AGENTS.md](AGENTS.md) - règles du repo pour les agents qui bossent sur
  Codex Claw
- [docs/architecture.md](docs/architecture.md) - architecture produit et
  processus
- [docs/codex.md](docs/codex.md) - notes sur le protocole Codex app-server
- [docs/mcp.md](docs/mcp.md) - serveur de collaboration Claw MCP
- [docs/frontend.md](docs/frontend.md) - principes renderer et thèmes
- [docs/testing.md](docs/testing.md) - stratégie de test et barre de couverture
- [plans/codex-claw.md](plans/codex-claw.md) - progression produit

## Licence

Apache-2.0. Voir [LICENSE](LICENSE).
