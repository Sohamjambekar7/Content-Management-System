# Stage 1: Build the Angular application
FROM node:20 as build

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Set the production API URL at build time, e.g. --build-arg BACKEND_API_URL=https://api.example.com
ARG BACKEND_API_URL=https://YOUR_API_DOMAIN
RUN sed -i "s|https://YOUR_API_DOMAIN|${BACKEND_API_URL}|g" src/environments/environment.ts

# Build the Angular app
RUN npm run build -- --configuration production

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy the built Angular app to Nginx's serve directory
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

# Copy a custom Nginx configuration (if needed)
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]