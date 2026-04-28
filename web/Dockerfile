##################
# BUILD BASE IMAGE
##################

FROM node:20-alpine AS base

# Install and use pnpm
RUN npm install -g pnpm

#############################
# BUILD FOR LOCAL DEVELOPMENT
#############################

FROM base As development
WORKDIR /app
RUN chown -R node:node /app

COPY --chown=node:node package*.json pnpm-lock.yaml ./
RUN pnpm install

COPY --chown=node:node . .

USER node

#####################
# BUILD BUILDER IMAGE
#####################

FROM base AS builder
WORKDIR /app

COPY --chown=node:node package*.json pnpm-lock.yaml ./
COPY --chown=node:node --from=development /app/node_modules ./node_modules
COPY --chown=node:node --from=development /app/src ./src
COPY --chown=node:node --from=development /app/public ./public
COPY --chown=node:node --from=development /app/next.config.ts ./next.config.ts
COPY --chown=node:node --from=development /app/tsconfig.json ./tsconfig.json

RUN pnpm build

USER node

######################
# BUILD FOR PRODUCTION
######################

FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV production
ENV PORT 8000

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next ./next
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/next.config.ts ./

USER node

EXPOSE 8000

CMD [ "pnpm", "start" ]
