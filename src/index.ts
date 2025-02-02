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

config();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "!";
const SOUNDS_DIR = join(__dirname, "../sounds");
const SUPPORTED_FORMATS = [".mp3", ".wav", ".ogg"];

interface BotConfig {
  token: string;
}

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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

const punishedUsers = new Map<string, VoiceChannel>();
const player = createAudioPlayer();

const commandDescriptions = {
  help: "Shows this help message",
  kidnap: "Kidnap a specific user (Usage: !kidnap @user)",
  randomkidnap: "Kidnap a random user from your voice channel",
  punish: "Lock someone in the punishment room (Usage: !punish @user)",
  unpunish: "Release someone from punishment (Usage: !unpunish @user)",
};

const kidnappingChannels = new Set<string>();

async function cleanupKidnappingChannel(channel: VoiceChannel | StageChannel) {
  try {
    if (channel.members.size === 0) {
      await channel.delete();
      kidnappingChannels.delete(channel.id);
    }
  } catch (error) {
    console.error(`Failed to cleanup kidnapping channel:`, error);
  }
}

async function moveUserToChannel(
  member: GuildMember,
  channel: VoiceChannel | StageChannel
): Promise<boolean> {
  try {
    await member.voice.setChannel(channel);
    return true;
  } catch (error) {
    console.error(`Failed to move user ${member.user.tag}:`, error);
    return false;
  }
}

async function createVoiceConnection(
  channel: VoiceChannel | StageChannel
): Promise<VoiceConnection | undefined> {
  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    return connection;
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

    if (soundFiles.length === 0) return null;

    const randomFile =
      soundFiles[Math.floor(Math.random() * soundFiles.length)];
    return join(SOUNDS_DIR, randomFile);
  } catch (error) {
    console.error("Error reading sounds directory:", error);
    return null;
  }
}

async function checkAndLeaveEmptyChannel(channel: VoiceChannel | StageChannel) {
  const connection = getVoiceConnection(channel.guild.id);
  if (connection && channel.members.size <= 1) {
    connection.destroy();
    player.stop();
  }
}

async function playScreamSound(
  channel: VoiceChannel | StageChannel
): Promise<void> {
  try {
    const soundFile = await getRandomSoundFile();
    if (!soundFile) return;

    const existingConnection = getVoiceConnection(channel.guild.id);
    if (existingConnection) {
      existingConnection.destroy();
    }

    const connection = await createVoiceConnection(channel);
    if (!connection) return;

    const resource = createAudioResource(soundFile);
    connection.subscribe(player);
    player.play(resource);

    return new Promise((resolve) => {
      player.on(AudioPlayerStatus.Idle, () => {
        checkAndLeaveEmptyChannel(channel);
        resolve();
      });

      player.on("error", (error) => {
        console.error("Audio player error:", error);
        checkAndLeaveEmptyChannel(channel);
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
  const kidnappingChannel = await member.guild.channels.create({
    name: "kidnapping-room",
    type: ChannelType.GuildVoice,
  });

  if (!(kidnappingChannel instanceof VoiceChannel)) return;

  kidnappingChannels.add(kidnappingChannel.id);

  setTimeout(async () => {
    if (kidnappingChannels.has(kidnappingChannel.id)) {
      await cleanupKidnappingChannel(kidnappingChannel);
    }
  }, 30000);

  await moveUserToChannel(member, kidnappingChannel);
  await playScreamSound(kidnappingChannel);

  if (originalChannel) {
    await moveUserToChannel(member, originalChannel);
  }

  await cleanupKidnappingChannel(kidnappingChannel);
}

async function createPunishmentRoom(
  guild: any,
  target: GuildMember
): Promise<VoiceChannel> {
  const channel = await guild.channels.create({
    name: `prison-${target.user.username}`,
    type: ChannelType.GuildVoice,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: ["Connect", "Speak", "Stream", "UseVAD", "ViewChannel"],
      },
      {
        id: client.user!.id,
        allow: ["Connect", "Speak", "MoveMembers", "ViewChannel"],
      },
      {
        id: target.id,
        allow: ["Connect", "ViewChannel"],
        deny: ["Speak", "Stream", "UseVAD"],
      },
    ],
  });

  if (!(channel instanceof VoiceChannel)) {
    throw new Error("Failed to create voice channel");
  }

  return channel;
}

async function sendTemporaryMessage(
  channel: any,
  content: string | { embeds: any[] },
  duration: number = 5000
) {
  const message = await channel.send(content);
  setTimeout(() => message.delete().catch(console.error), duration);
}

client.on("ready", () => {
  console.log(`Bot is ready! Logged in as ${client.user?.tag}`);
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

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

    if (oldState.channel && kidnappingChannels.has(oldState.channel.id)) {
      await cleanupKidnappingChannel(oldState.channel);
    }

    if (oldState.channel && oldState.channel.members.size <= 1) {
      await checkAndLeaveEmptyChannel(oldState.channel);
    }
  }
);

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.split(" ");
  const command = args[0].toLowerCase();

  if (!command.startsWith(COMMAND_PREFIX)) return;

  try {
    await message.delete();
  } catch (error) {
    console.error("Failed to delete command message:", error);
  }

  const commandName = command.slice(COMMAND_PREFIX.length);

  switch (commandName) {
    case "help": {
      const helpEmbed = {
        color: 0x9b59b6,
        title: "🎭 TrollBot Commands",
        description: "Here are all the available commands:",
        fields: Object.entries(commandDescriptions).map(([cmd, desc]) => ({
          name: `${COMMAND_PREFIX}${cmd}`,
          value: desc,
          inline: false,
        })),
        footer: {
          text: "Created by TPotGroup",
        },
      };

      await sendTemporaryMessage(
        message.channel,
        { embeds: [helpEmbed] },
        15000
      );
      break;
    }

    case "kidnap": {
      const target = message.mentions.members?.first();
      if (!target) {
        await sendTemporaryMessage(
          message.channel,
          "Please mention a user to kidnap!"
        );
        return;
      }
      if (!target.voice.channel) {
        await sendTemporaryMessage(
          message.channel,
          "Target user is not in a voice channel!"
        );
        return;
      }
      if (
        !(
          target.voice.channel instanceof VoiceChannel ||
          target.voice.channel instanceof StageChannel
        )
      ) {
        await sendTemporaryMessage(
          message.channel,
          "User must be in a voice channel!"
        );
        return;
      }
      await kidnap(target, target.voice.channel);
      await sendTemporaryMessage(
        message.channel,
        `Successfully kidnapped ${target.user.username}! 👻`
      );
      break;
    }

    case "randomkidnap": {
      const voiceChannel = message.member?.voice.channel;
      if (!voiceChannel) {
        await sendTemporaryMessage(
          message.channel,
          "You need to be in a voice channel!"
        );
        return;
      }
      if (
        !(
          voiceChannel instanceof VoiceChannel ||
          voiceChannel instanceof StageChannel
        )
      ) {
        await sendTemporaryMessage(
          message.channel,
          "You must be in a voice channel!"
        );
        return;
      }

      const members = Array.from(voiceChannel.members.values());

      if (members.length < 1) {
        await sendTemporaryMessage(message.channel, "No one to kidnap!");
        return;
      }

      const randomMember = members[Math.floor(Math.random() * members.length)];
      await kidnap(randomMember, voiceChannel);
      await sendTemporaryMessage(
        message.channel,
        `Successfully kidnapped ${randomMember.user.username}! 👻`
      );
      break;
    }

    case "punish": {
      const target = message.mentions.members?.first();
      if (!target) {
        await sendTemporaryMessage(
          message.channel,
          "Please mention a user to punish!"
        );
        return;
      }

      if (punishedUsers.has(target.id)) {
        await sendTemporaryMessage(
          message.channel,
          "This user is already in prison!"
        );
        return;
      }

      try {
        const punishChannel = await createPunishmentRoom(message.guild, target);

        if (target.voice.channel) {
          await target.voice.setMute(true, "User has been imprisoned");
        }

        punishedUsers.set(target.id, punishChannel);
        await moveUserToChannel(target, punishChannel);
        await sendTemporaryMessage(
          message.channel,
          `${target.user.username} has been imprisoned! They are now in solitary confinement. 🔒`
        );
      } catch (error) {
        console.error("Error while punishing user:", error);
        await sendTemporaryMessage(
          message.channel,
          "Failed to imprison the user. They might have higher permissions than the bot."
        );
      }
      break;
    }

    case "unpunish": {
      const target = message.mentions.members?.first();
      if (!target) {
        await sendTemporaryMessage(
          message.channel,
          "Please mention a user to release!"
        );
        return;
      }

      if (punishedUsers.has(target.id)) {
        try {
          if (target.voice.channel) {
            await target.voice.setMute(false, "User has been released");
          }

          const punishChannel = punishedUsers.get(target.id);
          if (punishChannel) {
            const afkChannel = message.guild.afkChannel;
            if (afkChannel && target.voice.channel?.id === punishChannel.id) {
              await target.voice.setChannel(afkChannel);
            }

            await punishChannel.delete();
          }

          punishedUsers.delete(target.id);
          await sendTemporaryMessage(
            message.channel,
            `${target.user.username} has been released from prison and can speak again! 🔓`
          );
        } catch (error) {
          console.error("Error while releasing user:", error);
          await sendTemporaryMessage(
            message.channel,
            "Failed to fully release the user. They might need manual permission fixes."
          );
        }
      } else {
        await sendTemporaryMessage(
          message.channel,
          "This user is not in prison!"
        );
      }
      break;
    }
  }
});

try {
  const config = validateConfig();
  client.login(config.token);
} catch (error) {
  console.error("Failed to start bot:", error);
  process.exit(1);
}
