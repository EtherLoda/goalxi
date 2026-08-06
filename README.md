# GoalXI - Football Manager Game

GoalXI is a modern, web-based football manager game where users can manage their own football teams, compete in leagues, trade players, and simulate matches with detailed tactical control.

## 🚀 Features

### 🏟️ Match Simulation Engine
- **Real-time Simulation**: Matches are simulated event-by-event with a sophisticated probability engine.
- **Tactical Control**: Set formations, lineups, and instructions. Adjust tactics before matches.
- **Live Events**: Watch matches unfold with live commentary and event updates (Goals, Cards, Substitutions, VAR).
- **Detailed Stats**: Comprehensive post-match statistics including possession, shots, xG, and player ratings.

### 👥 Team Management
- **Squad Building**: Manage your roster, train players, and handle contracts.
- **Transfers & Auctions**: Buy and sell players in a dynamic market with real-time bidding.
- **Youth Academy**: Scout and develop young talent.

### 📊 Statistics & Analysis
- **Player Career Tracking**: Detailed history of every player's career including goals, assists, and transfer history.
- **League Tables**: Automated league standings and fixtures.
- **Financial Management**: Track income, expenses, and sponsorship deals.

## 🛠️ Tech Stack

- **Backend**: NestJS (Node.js), TypeORM, PostgreSQL, Redis, BullMQ
- **Frontend**: Next.js 16.2.3 (App Router), React 19.2.4, TailwindCSS 4, next-intl, Zustand
- **Infrastructure**: Docker, Docker Compose

## 📂 Project Structure

- `api/`: Main backend API service (NestJS)
- `simulator/`: Dedicated microservice for match simulation (NestJS)
- `settlement/`: Dedicated microservice for financial settlement (NestJS)
- `libs/`: Shared libraries (Database entities, DTOs, Utilities)
- `web/`: Next.js frontend application (port 8000)

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm
- Docker & Docker Compose

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/EtherLoda/goalxi.git
   cd goalxi
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start Infrastructure (DB, Redis)**
   ```bash
   docker-compose up -d
   ```

4. **Run Migrations**
   ```bash
   cd api
   pnpm typeorm migration:run
   ```

5. **Start Services**
   ```bash
   # Terminal 1: Start API
   cd api
   pnpm start:dev

   # Terminal 2: Start Simulator
   cd simulator
   pnpm start:dev
   ```

### Production deployment (`MODULES_SET`)

The API container can boot in three modes controlled by the
`MODULES_SET` env var. **It defaults to `monolith`** for dev
ergonomics — every cron, controller, and worker is mounted in a
single process. For production you must split them so cron
handlers don't run twice in parallel (which would double-write
rows in `training_update`, `transaction`, etc.).

| Mode         | HTTP API | Background cron / workers | Use it for                                   |
| ------------ | :------: | :-----------------------: | -------------------------------------------- |
| `monolith`   |    ✅    |             ✅             | local dev only — never ship to prod          |
| `api`        |    ✅    |             ❌             | the public-facing API container              |
| `background` |    ❌    |             ✅             | the API container's sidecar / worker process |

> ⚠️ **Don't deploy `monolith` to production.** Two replicas
> running `monolith` will race on the same cron schedule and
> produce duplicate `match_simulation` jobs, double-applied
> `weekly-settlement` ticks, etc. Either run a single
> `monolith` replica (one-box deploys) or split into `api` +
> `background`.

The bootstrap log line is your canary — every API process prints
`[Bootstrap] MODULES_SET=<value>` at startup. Mismatches between
`docker-compose.yml` and `.env` surface immediately.

Example production stack:

```yaml
# docker-compose.prod.yml
services:
  api:
    image: goalxi-api
    environment:
      MODULES_SET: api          # HTTP only
  api-worker:
    image: goalxi-api
    environment:
      MODULES_SET: background  # cron + workers, no HTTP
  simulator:
    image: goalxi-simulator
  settlement:
    image: goalxi-settlement
```

## 📖 Documentation

- [Database Schema](api/docs/database-schema.md)
- [API Documentation](api/docs/api-documentation.md)

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
