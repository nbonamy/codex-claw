<p align="center">
   <img src="assets/icon.png" width="128" height="128" alt="Icône de l'app Codex Claw" />
</p>

# Codex Claw

[Version anglaise](README.md)

Rencontrez votre crew Codex natif. Codex Claw est une app desktop qui vous
laisse lancer une vraie bande d'agents Codex, chacun avec son dossier, son
identité, son fil, ses outils et sa boîte de réception. Le tout s'affiche comme
une vraie app, pas comme un flot de terminal qui part en freestyle.

![Electron](https://img.shields.io/badge/Electron-42+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-3178c6)
![Licence](https://img.shields.io/badge/Licence-Apache--2.0-green)

## Pourquoi Codex Claw

- **Ça sent la salle d'équipe:** teams, agents, avatars, dossiers, statuts et
  templates Bench restent visibles, rangés, nickel.
- **Rendu Codex natif:** messages, appels d'outils, sorties de commandes,
  validations, questions, plans, éditions de fichiers, stats de diff et
  Markdown deviennent une vraie UI d'app.
- **Collab pour de vrai:** le MCP intégré permet aux agents de s'inscrire, de
  poser leur statut, de lister les collègues, d'envoyer des messages, de
  broadcaster et de checker leur inbox.
- **Fait pour le flow de dev:** mettez des prompts en file, reprenez la main
  sur les tours actifs, interrompez le taf, mentionnez des fichiers, déclenchez
  des skills, dictez vos prompts, et gardez le contexte comme les rate limits
  sous les yeux.

## Fonctionnalités

- **Gestion des teams et agents** - Créez des teams, ajoutez des agents Codex,
  modifiez les avatars, déplacez les agents entre teams, dupliquez, redémarrez,
  fermez, et persistez tout ce petit monde.
- **Templates Bench** - Sauvegardez les bons agents comme templates
  réutilisables et redéployez-les dans une team quand ça redevient chaud.
- **Surface de chat native** - Streamez le texte assistant, les parties de
  messages ordonnées, le code avec coloration syntaxique, les liens, les
  groupes d'outils, les logs de commandes et les résumés de changements de
  fichiers.
- **Modes plan et goal** - Activez le plan mode Codex, lancez des tours orientés
  objectif, et traitez les mises à jour de mode venant de l'app-server.
- **Communication agent-à-agent** - Serveur MCP local Claw avec des outils de
  collaboration façon Skwad.
- **Composer blindé** - Sélecteur de modèle et de reasoning, prompts en file,
  pilotage du tour actif, slash commands, recherche de skills, mentions de
  fichiers, pièces jointes et dictée macOS.
- **Awareness runtime** - Jauge de fenêtre de contexte, rate limits du compte,
  statut backend, statut agent, reprise de l'historique de thread et skeletons
  de chargement.

## Prérequis

- Un environnement de dev macOS récent.
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

Le packaging macOS signe et notarise par défaut. Pour les checks locaux qui
n'ont pas besoin de la signature release:

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run build
CODEX_CLAW_SKIP_SIGNING=1 npm run package
```

## Architecture

Codex Claw garde les détails du protocole Codex dans Electron main:

```text
Renderer UI -> typed preload IPC -> Electron main -> backend driver -> Codex app-server
```

Le renderer consomme des événements appartenant à l'app et des parties
`RendererMessage`. Codex est le backend implémenté aujourd'hui, avec une
interface backend bien étroite, prête pour un futur driver Claude Code. Propre,
carré, pas de bidouille cracra.

## Documentation

- [AGENTS.md](AGENTS.md) - règles du repo pour les agents qui bossent sur Codex
  Claw
- [docs/architecture.md](docs/architecture.md) - architecture produit et
  processus
- [docs/codex.md](docs/codex.md) - notes sur le protocole Codex app-server
- [docs/mcp.md](docs/mcp.md) - serveur de collaboration Claw MCP
- [docs/frontend.md](docs/frontend.md) - principes renderer et theming
- [docs/testing.md](docs/testing.md) - stratégie de test et barre de couverture
- [plans/codex-claw.md](plans/codex-claw.md) - progression produit

## Licence

Apache-2.0. Voir [LICENSE](LICENSE).
