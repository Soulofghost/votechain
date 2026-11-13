FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY contracts/ ./contracts/

ENV PORT=4026
EXPOSE 4026

CMD ["node", "backend/src/server.js"]
