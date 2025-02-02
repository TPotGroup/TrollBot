import {
  Client,
  GatewayIntentBits,
  Partials,
  VoiceChannel,
  GuildMember,
  Message,
  VoiceState,
  ChannelType,
  StageChannel,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnection,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { config } from "dotenv";
import { join } from "path";
import { fileURLToPath } from "url";
import { readdir } from "fs/promises";

// Configure environment variables
config();

// Get the current directory
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Constants
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "!";
const SOUNDS_DIR = join(__dirname, "../sounds");

// Supported audio formats
const SUPPORTED_FORMATS = [".mp3", ".wav", ".ogg"];

interface BotConfig {
  token: string;
}

// Validate environment variables
function validateConfig(): BotConfig {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN is required in environment variables");
  }
  return { token };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Store punished users: userId -> VoiceChannel
const punishedUsers = new Map<string, VoiceChannel>();

// Create audio player
const player = createAudioPlayer();

async function moveUserToChannel(
  member: GuildMember,
  channel: VoiceChannel | StageChannel
): Promise<boolean> {
  try {
    await member.voice.setChannel(channel);
    return true;
  } catch (error) {
    console.error("Failed to move user:", error);
    return false;
  }
}

async function createVoiceConnection(
  channel: VoiceChannel | StageChannel
): Promise<VoiceConnection | undefined> {
  try {
    // Explicitly type the adapter creator
    const adapterCreator = channel.guild.voiceAdapterCreator;

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator,
      selfDeaf: false,
    });

    // Wait for the connection to be ready
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      return connection;
    } catch (error) {
      connection.destroy();
      throw error;
    }
  } catch (error) {
    console.error("Error creating voice connection:", error);
    return undefined;
  }
}

async function getRandomSoundFile(): Promise<string | null> {
  try {
    const files = await readdir(SOUNDS_DIR);
    const soundFiles = files.filter((file) =>
      SUPPORTED_FORMATS.some((format) => file.toLowerCase().endsWith(format))
    );

    if (soundFiles.length === 0) {
      console.error("No sound files found in sounds directory!");
      return null;
    }

    const randomFile =
      soundFiles[Math.floor(Math.random() * soundFiles.length)];
    return join(SOUNDS_DIR, randomFile);
  } catch (error) {
    console.error("Error reading sounds directory:", error);
    return null;
  }
}

async function playScreamSound(
  channel: VoiceChannel | StageChannel
): Promise<void> {
  try {
    // Get a random sound file
    const soundFile = await getRandomSoundFile();
    if (!soundFile) {
      console.error("No sound file available to play");
      return;
    }

    // Disconnect any existing connection
    const existingConnection = getVoiceConnection(channel.guild.id);
    if (existingConnection) {
      existingConnection.destroy();
    }

    const connection = await createVoiceConnection(channel);
    if (!connection) {
      console.error("Failed to create voice connection");
      return;
    }

    const resource = createAudioResource(soundFile);

    connection.subscribe(player);
    player.play(resource);

    return new Promise((resolve) => {
      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
        resolve();
      });
    });
  } catch (error) {
    console.error("Error playing sound:", error);
  }
}

async function kidnap(
  member: GuildMember,
  originalChannel: VoiceChannel | StageChannel
): Promise<void> {
  // Create a temporary channel for kidnapping
  const kidnappingChannel = await member.guild.channels.create({
    name: "kidnapping-room",
    type: ChannelType.GuildVoice,
  });

  if (!(kidnappingChannel instanceof VoiceChannel)) {
    console.error("Failed to create voice channel");
    return;
  }

  // Move user to kidnapping channel
  await moveUserToChannel(member, kidnappingChannel);

  // Play scream sound
  await playScreamSound(kidnappingChannel);

  // Move user back
  if (originalChannel) {
    await moveUserToChannel(member, originalChannel);
  }

  // Delete temporary channel
  await kidnappingChannel.delete();
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

// Handle voice state updates for punished users
client.on(
  "voiceStateUpdate",
  async (oldState: VoiceState, newState: VoiceState) => {
    const userId = newState.member?.id;
    if (userId && punishedUsers.has(userId)) {
      const punishChannel = punishedUsers.get(userId);
      if (punishChannel && newState.channelId !== punishChannel.id) {
        await moveUserToChannel(newState.member, punishChannel);
      }
    }
  }
);

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.split(" ");
  const command = args[0].toLowerCase();

  if (!command.startsWith(COMMAND_PREFIX)) return;

  const commandName = command.slice(COMMAND_PREFIX.length);

  switch (commandName) {
    case "kidnap": {
      const target = message.mentions.members?.first();
      if (!target) {
        await message.reply("Please mention a user to kidnap!");
        return;
      }
      if (!target.voice.channel) {
        await message.reply("Target user is not in a voice channel!");
        return;
      }
      if (
        !(
          target.voice.channel instanceof VoiceChannel ||
          target.voice.channel instanceof StageChannel
        )
      ) {
        await message.reply("User must be in a voice channel!");
        return;
      }
      await kidnap(target, target.voice.channel);
      break;
    }

    case "randomkidnap": {
      const voiceChannel = message.member?.voice.channel;
      if (!voiceChannel) {
        await message.reply("You need to be in a voice channel!");
        return;
      }
      if (
        !(
          voiceChannel instanceof VoiceChannel ||
          voiceChannel instanceof StageChannel
        )
      ) {
        await message.reply("You must be in a voice channel!");
        return;
      }

      const members = Array.from(voiceChannel.members.values());
      if (members.length < 1) {
        await message.reply("No one to kidnap!");
        return;
      }

      const randomMember = members[Math.floor(Math.random() * members.length)];
      await kidnap(randomMember, voiceChannel);
      break;
    }

    case "punish": {
      const target = message.mentions.members?.first();
      if (!target) {
        await message.reply("Please mention a user to punish!");
        return;
      }

      // Create punishment channel if it doesn't exist
      let punishChannel = message.guild.channels.cache.find(
        (c): c is VoiceChannel =>
          c instanceof VoiceChannel && c.name === "punishment-room"
      );

      if (!punishChannel) {
        const newChannel = await message.guild.channels.create({
          name: "punishment-room",
          type: ChannelType.GuildVoice,
        });

        if (!(newChannel instanceof VoiceChannel)) {
          await message.reply("Failed to create punishment channel!");
          return;
        }
        punishChannel = newChannel;
      }

      punishedUsers.set(target.id, punishChannel);
      await moveUserToChannel(target, punishChannel);
      await message.reply(`${target.user.username} has been punished!`);
      break;
    }

    case "unpunish": {
      const target = message.mentions.members?.first();
      if (!target) {
        await message.reply("Please mention a user to unpunish!");
        return;
      }

      if (punishedUsers.has(target.id)) {
        punishedUsers.delete(target.id);
        await message.reply(`${target.user.username} has been unpunished!`);
      } else {
        await message.reply("This user is not punished!");
      }
      break;
    }
  }
});

// Start the bot
try {
  const config = validateConfig();
  client.login(config.token);
} catch (error) {
  console.error("Failed to start bot:", error);
  process.exit(1);
}
