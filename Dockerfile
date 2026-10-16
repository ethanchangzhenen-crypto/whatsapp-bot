FROM node:20
WORKDIR /app
RUN apt-get update && apt-get install -y git
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
CMD ["node", "bot.js"]
