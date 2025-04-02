# Use Node.js LTS as the base image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application, including .txt files
COPY . .

# Start the application
CMD ["npm", "start"]
