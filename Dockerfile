# Stage 1: Build the React application
FROM node:18-alpine AS build
WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Copy all files and build
COPY . .

# Pass build args if you want to bake environment variables into the image at build time
# ARG VITE_TELEGRAM_BOT_TOKEN
# ARG VITE_TELEGRAM_CHAT_ID
# ARG VITE_BACKUP_BOT_TOKEN

RUN npm run build

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy the custom nginx configuration for Single Page Applications
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built files from the previous stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
