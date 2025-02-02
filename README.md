# Discord Torture Bot

A Discord bot designed for harmless trolling with voice channel features, built with Node.js and Bun.

## Features

- Random voice channel kidnapping with screaming sound
- Targeted voice channel kidnapping
- Punishment system that locks users in a specific voice channel

## Prerequisites

- [Bun](https://bun.sh/) installed on your system
- A Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

## Setup

1. Install dependencies:

```bash
bun install
```

2. Create a `.env` file with your Discord bot token:

```
DISCORD_TOKEN=your_bot_token_here
```

3. Add a sound file named `scream.mp3` in the `sounds` directory

4. Run the bot:

```bash
# Development mode with auto-reload
bun dev

# Production mode
bun start
```

## Commands

- `!kidnap @user` - Kidnap a specific user, play sound, and return them
- `!randomkidnap` - Randomly kidnap someone from your current voice channel
- `!punish @user` - Force a user to stay in the punishment channel
- `!unpunish @user` - Remove punishment from a user
