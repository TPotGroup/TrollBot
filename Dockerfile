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

# Default scream sound (you should mount your own sound file)
COPY sounds/scream.mp3 ./sounds/scream.mp3

# Start the bot
CMD ["bun", "start"] 