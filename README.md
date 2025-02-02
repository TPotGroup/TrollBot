# Discord Torture Bot

A Discord bot designed for harmless trolling with voice channel features, built with Node.js and Bun.

## Features

- Random voice channel kidnapping with random sound effects
- Targeted voice channel kidnapping
- Punishment system that locks users in a specific voice channel
- Support for multiple audio formats (MP3, WAV, OGG)

## Prerequisites

- [Bun](https://bun.sh/) installed on your system (for local development)
- A Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications)
- Docker and Docker Compose (for containerized deployment)

## Local Development Setup

1. Install dependencies:

```bash
bun install
```

2. Create a `.env` file with your Discord bot token:

```
DISCORD_TOKEN=your_bot_token_here
COMMAND_PREFIX=!
```

3. Add sound files to the `sounds` directory:

   - Supported formats: `.mp3`, `.wav`, `.ogg`
   - The bot will randomly select one of these sounds each time
   - You can add or remove sounds while the bot is running

4. Run the bot:

```bash
# Development mode with auto-reload
bun dev

# Production mode
bun start
```

## Docker Deployment

### Using Docker Compose (Recommended)

1. Create a `.env` file with your Discord bot token
2. Add your sound files to the `sounds` directory
3. Build and run the container:

```bash
docker-compose up -d
```

### Using Docker

1. Build the image:

```bash
docker build -t troll-bot .
```

2. Run the container:

```bash
docker run -d \
  --name troll-bot \
  --restart unless-stopped \
  -v $(pwd)/sounds:/app/sounds \
  --env-file .env \
  troll-bot
```

### Coolify Deployment

1. In your Coolify dashboard:

   - Create a new service
   - Select "Docker Compose"
   - Connect your GitHub repository
   - Set the following environment variables:
     - `DISCORD_TOKEN`: Your bot token
     - `COMMAND_PREFIX`: Command prefix (default: !)
   - Deploy the service

2. After deployment:
   - Create a `sounds` directory in the container
   - Upload your sound files (MP3, WAV, or OGG) to the sounds directory
   - The bot will automatically use any new sounds you add
   - The bot will automatically restart when configuration changes

## Commands

- `!kidnap @user` - Kidnap a specific user, play a random sound, and return them
- `!randomkidnap` - Randomly kidnap someone from your current voice channel
- `!punish @user` - Force a user to stay in the punishment channel
- `!unpunish @user` - Remove punishment from a user

## Sound Files

- Place your sound files in the `sounds` directory
- Supported formats: `.mp3`, `.wav`, `.ogg`
- Files can be added/removed while the bot is running
- The bot will randomly select one sound for each kidnapping
- No specific naming convention required

## Required Bot Permissions

- View Channels
- Send Messages
- Read Message History
- Connect to Voice Channels
- Speak in Voice Channels
- Move Members
- Manage Channels

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
