<p align="center">
   <img src="assets/icon.png" width="128" height="128" alt="Icône de l'app Codex Claw" />
</p>

# Codex Claw

[English version](README.md)

Voici ton crew Codex en appli native. Codex Claw est une app desktop qui te
permet de lancer une vraie petite équipe d'agents Codex, chacun avec son
dossier, son identité, son fil, ses outils et sa boîte de réception. Le tout
s'affiche comme une vraie app bien propre, pas comme un flux de terminal qui
part en freestyle.

![Electron](https://img.shields.io/badge/Electron-42+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-3178c6)
![Licence](https://img.shields.io/badge/Licence-Apache--2.0-green)

## Pourquoi Codex Claw

- **Ça sent la salle d'équipe:** équipes, agents, avatars, dossiers, statuts et
  modèles Bench restent visibles, rangés, et prêts à charbonner.
- **Rendu Codex natif:** messages, appels d'outils, sorties de commandes,
  validations, questions, plans, éditions de fichiers, stats de diff et
  Markdown s'affichent comme de la vraie UI.
- **Vraiment collaboratif:** le MCP intégré permet aux agents de s'inscrire,
  poser leur statut, lister la team, s'envoyer des messages, diffuser une
  annonce et checker leur inbox.
- **Pensé pour le flow de dev:** empile les prompts, recadre un tour actif,
  interromps le taf, mentionne des fichiers, lance des skills, dicte tes
  prompts, et garde le contexte comme les rate limits sous les yeux.

## Fonctionnalités

- **Gestion des équipes et agents** - Crée des équipes, ajoute des agents
  Codex, modifie les avatars, déplace les agents entre équipes, duplique,
  redémarre, ferme et persiste tout ce petit monde.
- **Modèles Bench** - Sauvegarde les bons agents comme modèles réutilisables et
  redéploie-les dans une équipe quand tu veux repartir sur du solide.
- **Surface de chat native** - Stream du texte assistant, parties de messages
  ordonnées, code avec coloration syntaxique, liens, groupes d'outils, logs de
  commandes et résumés de changements de fichiers.
- **Modes plan et objectif** - Active le mode plan de Codex, lance des tours
  orientés objectif, et traite les mises à jour de mode de l'app-server.
- **Communication agent à agent** - Serveur MCP local Claw avec des outils de
  collaboration façon Skwad, histoire que la team ne bosse pas chacun dans son
  coin.
- **Compositeur survitaminé** - Sélecteur de modèle/raisonnement, prompts en
  file d'attente, pilotage du tour actif, slash commands, recherche de skills,
  mentions de fichiers, boutons de pièces jointes et dictée macOS.
- **Conscience runtime** - Jauge de fenêtre de contexte, limites de compte,
  état backend, statut d'agent, reprise d'historique de thread et skeletons de
  chargement. Bref, tu sais où tu mets les pieds.

## Prérequis

- Un environnement de développement macOS récent.
- Node.js compatible avec la toolchain Electron Forge/Vite.
- Accès à un binaire Codex app-server.

Codex Claw peut utiliser un Codex home isolé via `CODEX_CLAW_CODEX_HOME` et
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

Le packaging macOS signe et notarise par défaut. Pour des checks locaux qui
n'ont pas besoin de signature release:

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run build
CODEX_CLAW_SKIP_SIGNING=1 npm run package
```

## Architecture

Codex Claw garde les détails du protocole Codex côté Electron main:

```text
Renderer UI -> typed preload IPC -> Electron main -> backend driver -> Codex app-server
```

Le renderer consomme des événements appartenant à l'app et des parties
`RendererMessage`. Codex est le backend implémenté aujourd'hui, avec une
frontière backend bien étroite et prête pour un futur driver Claude Code.

## Documentation

- [AGENTS.md](AGENTS.md) - règles du repo pour les agents qui bossent sur Codex
  Claw
- [docs/architecture.md](docs/architecture.md) - architecture produit et
  processus
- [docs/codex.md](docs/codex.md) - notes sur le protocole Codex app-server
- [docs/mcp.md](docs/mcp.md) - serveur de collaboration MCP de Claw
- [docs/frontend.md](docs/frontend.md) - principes renderer et theming
- [docs/testing.md](docs/testing.md) - stratégie de test et barre de couverture
- [plans/codex-claw.md](plans/codex-claw.md) - progression produit

## Licence

Apache-2.0. Voir [LICENSE](LICENSE).
