<p align="center">
   <img src="assets/icon.png" width="128" height="128" alt="Icone de l'application Codex Claw" />
</p>

# Codex Claw

Rencontrez votre equipe native de developpement avec Codex. Codex Claw est une
application desktop qui vous permet de lancer une equipe d'agents Codex, chacun
avec son dossier, son identite, son fil de discussion, ses outils et sa boite de
reception, tout en affichant le travail dans une vraie application plutot que
dans un flot de terminal.

![Electron](https://img.shields.io/badge/Electron-42+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-3178c6)
![Licence](https://img.shields.io/badge/Licence-Apache--2.0-green)

## Pourquoi Codex Claw

- **Une vraie salle d'equipe :** equipes, agents, avatars, dossiers, statuts et
  modeles Bench restent visibles et bien organises.
- **Un rendu Codex natif :** messages, appels d'outils, sorties de commandes,
  validations, questions, plans, editions de fichiers, statistiques de diff et
  Markdown s'affichent comme une interface applicative.
- **Vraiment collaboratif :** le MCP integre permet aux agents de s'enregistrer,
  definir leur statut, lister les coequipiers, envoyer des messages, diffuser
  une annonce et consulter leur boite de reception.
- **Pense pour le flux de dev :** mise en file de prompts, pilotage des tours
  actifs, interruption du travail, mentions de fichiers, declenchement de
  competences, dictee de prompts et suivi du contexte comme des limites de taux.

## Fonctionnalites

- **Gestion des equipes et des agents** - Creez des equipes, ajoutez des agents
  Codex, modifiez les avatars, deplacez les agents entre equipes, dupliquez,
  redemarrez, fermez et persistez le tout.
- **Modeles Bench** - Sauvegardez les bons agents comme modeles reutilisables et
  redeployez-les dans une equipe.
- **Surface de chat native** - Streamez le texte assistant, les parties de
  message ordonnees, le code avec coloration syntaxique, les liens, les groupes
  d'outils, les journaux de commande et les resumes de changements de fichiers.
- **Modes plan et objectif** - Activez le mode plan de Codex, lancez des tours
  orientes objectif et traitez les mises a jour de mode de l'app-server.
- **Communication agent-a-agent** - Serveur MCP local de Claw avec outils de
  collaboration inspires de Skwad.
- **Super-pouvoirs du composeur** - Selecteur de modele et de raisonnement,
  prompts en file, pilotage du tour actif, commandes slash, recherche de
  competences, mentions de fichiers, pieces jointes et dictee macOS.
- **Conscience du runtime** - Jauge de fenetre de contexte, limites de compte,
  statut backend, statut agent, reprise de l'historique de fil et squelettes de
  chargement.

## Blague reglementaire

Codex Claw pour des agents francais, c'est simple : chaque agent travaille tres
vite, mais ouvre d'abord une issue pour debattre de l'emplacement exact de la
pause cafe, puis refuse de merger tant que le README n'a pas assez de panache.

## Prerequis

- Un environnement de developpement macOS recent.
- Node.js compatible avec la chaine d'outils Electron Forge/Vite.
- Acces a un binaire Codex app-server.

Codex Claw peut utiliser un home Codex isole via `CODEX_CLAW_CODEX_HOME` et
reprend les sessions d'agents persistantes quand c'est possible.

## Developpement

```bash
npm install
npm run dev
```

Commandes de verification utiles :

```bash
npm test
npm run test:coverage
npm run lint
npm run build
```

Le packaging macOS signe et notarise par defaut. Pour des controles locaux qui
n'ont pas besoin de signature de release :

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run build
CODEX_CLAW_SKIP_SIGNING=1 npm run package
```

## Architecture

Codex Claw garde les details du protocole Codex dans Electron main :

```text
Renderer UI -> typed preload IPC -> Electron main -> backend driver -> Codex app-server
```

Le renderer consomme des evenements appartenant a l'application et des parties
`RendererMessage`. Codex est le backend implemente aujourd'hui, avec une seam
backend etroite prete pour un futur driver Claude Code.

## Documentation

- [AGENTS.md](AGENTS.md) - regles du repo pour les agents qui travaillent sur
  Codex Claw
- [docs/architecture.md](docs/architecture.md) - architecture produit et
  processus
- [docs/codex.md](docs/codex.md) - notes sur le protocole Codex app-server
- [docs/mcp.md](docs/mcp.md) - serveur de collaboration MCP de Claw
- [docs/frontend.md](docs/frontend.md) - principes renderer et theming
- [docs/testing.md](docs/testing.md) - strategie de test et barre de couverture
- [plans/codex-claw.md](plans/codex-claw.md) - progression produit

## Licence

Apache-2.0. Voir [LICENSE](LICENSE).
