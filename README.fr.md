<p align="center">
   <img src="assets/icon.png" width="128" height="128" alt="Icône de l'application Codex Claw" />
</p>

# Codex Claw

[English version](README.md)

Voici ton crew Codex en version native, posé sur le bureau. Codex Claw est une
app desktop qui te laisse lancer une équipe d'agents Codex, chacun avec son
dossier, son identité, son fil, ses outils et sa boîte de réception. Le tout
s'affiche comme une vraie app, pas comme un flux de terminal en mode tunnel.

![Electron](https://img.shields.io/badge/Electron-42+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-3178c6)
![Licence](https://img.shields.io/badge/Licence-Apache--2.0-green)

## Pourquoi Codex Claw

- **Ça sent la vraie salle d'équipe :** teams, agents, avatars, dossiers,
  statuts et templates Bench restent visibles, rangés, nickel.
- **Rendu Codex natif :** messages, appels d'outils, sorties de commandes,
  validations, questions, plans, éditions de fichiers, stats de diff et
  Markdown deviennent une UI propre, pas un pavé illisible.
- **Collaboration pour de vrai :** le MCP intégré permet aux agents de
  s'inscrire, poser leur statut, lister les collègues, s'envoyer des messages,
  broadcaster et checker leur inbox.
- **Fait pour coder sans se prendre la tête :** tu peux empiler les prompts,
  guider un tour en cours, interrompre le taf, mentionner des fichiers,
  déclencher des skills, dicter des prompts et garder le contexte comme les
  rate limits sous les yeux.

## Fonctionnalités

- **Gestion des teams et agents** - Crée des teams, ajoute des agents Codex,
  modifie les avatars, déplace les agents entre teams, duplique, redémarre,
  ferme et persiste tout le bazar.
- **Templates Bench** - Sauve les bons agents comme templates réutilisables,
  puis redéploie-les dans une team quand tu veux.
- **Surface de chat native** - Stream du texte assistant, parties de message
  ordonnées, code coloré, liens, groupes d'outils, logs de commandes et résumés
  de changements de fichiers.
- **Modes plan et objectif** - Bascule le mode plan de Codex, lance des tours
  orientés objectif et traite les mises à jour de mode venues de l'app-server.
- **Communication entre agents** - Serveur MCP local Claw avec des outils de
  collaboration dans l'esprit Skwad.
- **Composer survitaminé** - Sélecteur de modèle et de raisonnement, prompts en
  file d'attente, pilotage du tour actif, slash commands, recherche de skills,
  mentions de fichiers, pièces jointes et dictée macOS.
- **Conscience runtime** - Jauge de fenêtre de contexte, limites de compte,
  statut backend, statut agent, reprise de l'historique de thread et skeletons
  de chargement.

## Prérequis

- Un environnement de dev macOS à jour.
- Node.js compatible avec la toolchain Electron Forge/Vite.
- Accès à un binaire Codex app-server.

Codex Claw peut utiliser un home Codex isolé via `CODEX_CLAW_CODEX_HOME` et
reprend les sessions d'agents persistées quand c'est possible.

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

Par défaut, le packaging macOS signe et notarise. Pour les checks locaux qui
n'ont pas besoin d'une signature de release :

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run build
CODEX_CLAW_SKIP_SIGNING=1 npm run package
```

## Architecture

Codex Claw garde les détails du protocole Codex côté Electron main :

```text
Renderer UI -> IPC preload type -> Electron main -> driver backend -> Codex app-server
```

Le renderer consomme des événements appartenant à l'app et des parties
`RendererMessage`. Codex est le backend implémenté aujourd'hui, avec une jointure
backend bien fine, prête pour un futur driver Claude Code.

## Documentation

- [AGENTS.md](AGENTS.md) - règles du repo pour les agents qui bossent sur
  Codex Claw
- [docs/architecture.md](docs/architecture.md) - architecture produit et
  processus
- [docs/codex.md](docs/codex.md) - notes sur le protocole Codex app-server
- [docs/mcp.md](docs/mcp.md) - serveur de collaboration MCP de Claw
- [docs/frontend.md](docs/frontend.md) - principes renderer et theming
- [docs/testing.md](docs/testing.md) - stratégie de test et barre de couverture
- [plans/codex-claw.md](plans/codex-claw.md) - progression produit

## Licence

Apache-2.0. Voir [LICENSE](LICENSE).
