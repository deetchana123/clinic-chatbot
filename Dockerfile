FROM node:18-alpine

WORKDIR /app

# Install dependencies first to leverage Docker layer cache
COPY package*.json ./
RUN npm ci --only=production

# Copy app
COPY . .

EXPOSE 3000
ENV NODE_ENV=production

CMD ["npm", "start"]
