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
