FROM node:20-bookworm-slim

WORKDIR /app

# Install deps first so this layer is cached unless package*.json changes
COPY package*.json ./
RUN npm install

# Source is bind-mounted over this in dev (see docker-compose.yml),
# this COPY only matters for a standalone/prod image build.
COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]
