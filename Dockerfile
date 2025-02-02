FROM oven/bun:1.0.35

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code and config files
COPY . .

# Create sounds directory
RUN mkdir -p sounds

# Start the bot
CMD ["bun", "start"] 