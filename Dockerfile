FROM node:18-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
    libcups2 libdrm2 libgbm1 libgtk-3-0 libnss3 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libxshmfence1 libxss1 libxtst6 xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

CMD ["node", "bot.js"]
