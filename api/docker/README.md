# Docker Setup for Mini-FC

## Automatic Database Initialization

The PostgreSQL container is configured to automatically create the `minifc` database on first startup.

### How it works:

1. **Init Script**: `docker/postgres/init-db.sh` is mounted to `/docker-entrypoint-initdb.d/`
2. **Auto-execution**: PostgreSQL runs all `.sh` and `.sql` files in this directory on first startup
3. **Database Creation**: The script creates the `minifc` database if it doesn't exist

### Starting the containers:

```bash
# Start all services
docker-compose up -d

# Or start only db and redis for local development
docker-compose up -d db redis
```

### Running migrations:

After containers are up, run migrations to create tables:

```bash
npm run migration:up
```

### Normal restart (keeps data):

```bash
# Stop containers (data persists in volumes)
docker-compose down

# Start again (your data is still there)
docker-compose up -d db redis
```

### Clean restart (fresh database - removes ALL data):

⚠️ **Warning**: This deletes all your test data!

```bash
# Stop and remove containers + volumes
docker-compose down -v

# Start again (will reinitialize empty database)
docker-compose up -d db redis

# Run migrations
npm run migration:up
```

## Services

- **minifc-db** (PostgreSQL 16): Port 25432
- **minifc-redis** (Redis Stack): Port 6379, 8001
- **pgadmin**: Port 18080 (admin@example.com / 12345678)
- **maildev**: Ports 1080 (UI), 1025 (SMTP)

## Environment Variables

The database is configured via `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in docker-compose.yml.

Default values:
- Database: `minifc` (created by init script)
- User: `postgres`
- Password: `postgres`

## Quick Reference

```bash
# Daily workflow (keeps your data)
docker-compose down              # Stop containers
docker-compose up -d db redis    # Start containers

# Fresh start (deletes everything)
docker-compose down -v           # Stop + delete volumes
docker-compose up -d db redis    # Start fresh
npm run migration:up             # Recreate tables

# View logs
docker-compose logs -f db        # Database logs
docker-compose logs -f redis     # Redis logs

# Access database directly
docker exec -it minifc-db psql -U postgres -d minifc
```

