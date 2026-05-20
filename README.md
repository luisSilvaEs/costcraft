# CostCraft

> Desktop application for construction cost estimation and unit price analysis, with INEGI price index integration for Mexico.

CostCraft is a desktop application built for construction professionals in Mexico. It streamlines the creation and management of unit price analyses (APU), allowing users to organize projects, define work concepts, break down costs by materials, labor, and equipment, and apply real-time price adjustments using INEGI economic indices. Each project is saved as a self-contained file, making it easy to share, archive, and version budgets without relying on external servers or cloud services.

---

## Features

- **Project management** — create, open, and organize construction budget projects
- **APU breakdown** — define concepts with materials, labor, equipment, and subcontract line items
- **Running totals** — live cost calculation as you edit line items
- **INEGI integration** — fetch and apply economic price indices for cost escalation
- **File-based projects** — each project is a portable `.presupuesto` file (SQLite), shareable via email or USB
- **Offline-first** — no server, no cloud dependency, works anywhere

---

## Tech Stack

| Layer            | Technology                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Desktop shell    | [Electron](https://www.electronjs.org/)                                                            |
| Frontend         | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)                        |
| Build tool       | [electron-vite](https://electron-vite.org/)                                                        |
| Database         | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Styling          | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)                     |
| State management | [Zustand](https://zustand-demo.pmnd.rs/)                                                           |
| Data fetching    | [TanStack Query](https://tanstack.com/query)                                                       |
| Package manager  | [pnpm](https://pnpm.io/)                                                                           |

---

## Project Structure

```
costcraft/
├── src/
│   ├── main/           # Electron main process (Node.js, SQLite, IPC handlers)
│   ├── preload/        # Context bridge — secure IPC channel
│   └── renderer/       # React application (UI)
│       ├── components/
│       ├── pages/
│       ├── store/      # Zustand global state
│       └── hooks/      # TanStack Query hooks
├── resources/          # App icons and static assets
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

---

## Data Model

Each project is stored as a `.presupuesto` file — a standard SQLite database with a custom extension. The app also maintains a small central database for application state (recent files, user preferences).

```
~/Documents/
  my-project.presupuesto      ← portable project file (SQLite)
  another-project.presupuesto

~/.config/costcraft/
  app.db                      ← app-level settings and recent files
```

Core schema: `projects → phases → chapters → concepts → apu_components`

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22 LTS or higher
- [pnpm](https://pnpm.io/) v9 or higher

```bash
npm install -g pnpm
```

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/costcraft.git
cd costcraft

# Install dependencies
pnpm install

# Start in development mode
pnpm dev
```

### Build

```bash
# Build for production (generates installer)
pnpm build

# Build for a specific platform
pnpm build:win   # Windows (.exe)
pnpm build:mac   # macOS (.dmg)
pnpm build:linux # Linux (.AppImage)
```

The packaged installer includes the SQLite engine (`better-sqlite3`) and all dependencies. No external installation required for end users.

---

## Development Notes

- **No Docker needed** — SQLite runs embedded via `better-sqlite3`, no server process required
- **IPC pattern** — all database and file system access goes through typed IPC channels between the renderer and main process
- **never commit `.db` or `.presupuesto` files** — these are user data and are excluded via `.gitignore`

---

## License

MIT
