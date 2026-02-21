<<<<<<< HEAD
require("dotenv").config();
const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Bot EMS Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Web alive"));

const fs = require("fs-extra");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const DATA_FILE = "./data.json";

function formatDuree(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}min`;
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeJsonSync(DATA_FILE, { service: {}, totals: {} }, { spaces: 2 });
    }
    const parsed = fs.readJsonSync(DATA_FILE);
    parsed.service ??= {};
    parsed.totals ??= {};
    return parsed;
  } catch (e) {
    console.log("❌ Erreur data.json -> reset :", e.message);
    const safe = { service: {}, totals: {} };
    fs.writeJsonSync(DATA_FILE, safe, { spaces: 2 });
    return safe;
  }
}

function saveData(d) {
  try {
    fs.writeJsonSync(DATA_FILE, d, { spaces: 2 });
  } catch (e) {
    console.log("❌ Impossible d'écrire data.json :", e.message);
  }
}

let data = loadData();

client.once("clientReady", () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  // !ping
  if (cmd === "!ping") return message.reply("🏓 Pong !");

  // 🎫 ticket
  if (cmd === "!ticket") {
    const EMS_ROLE_ID = process.env.EMS_ROLE_ID;
    const CATEGORY_ID = process.env.TICKET_CATEGORY_ID;

    if (!EMS_ROLE_ID) return message.reply("❌ EMS_ROLE_ID manquant dans .env");

    const existing = message.guild.channels.cache.find(
      c => c.name === `ticket-${message.author.id}`
    );
    if (existing) return message.reply("🎫 Tu as déjà un ticket ouvert.");

    const channel = await message.guild.channels.create({
      name: `ticket-${message.author.id}`,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID || null,
      permissionOverwrites: [
        { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: EMS_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      ],
    });

    await channel.send(`🚑 <@&${EMS_ROLE_ID}> nouveau ticket EMS !`);
    return channel.send(`🎫 Ticket créé pour <@${message.author.id}>.\nUtilise **!close** pour fermer.`);
  }

  // ❌ close
  if (cmd === "!close") {
    const EMS_ROLE_ID = process.env.EMS_ROLE_ID;

    if (!message.channel.name.startsWith("ticket-"))
      return message.reply("❌ Utilise ça dans un ticket.");

    const isEms = EMS_ROLE_ID && message.member.roles.cache.has(EMS_ROLE_ID);
    const isOwner = message.channel.name === `ticket-${message.author.id}`;

    if (!isEms && !isOwner) return message.reply("❌ Seuls les EMS (ou le créateur) peuvent fermer.");

    await message.channel.send("✅ Ticket fermé.");
    return message.channel.delete().catch(() => {});
  }

  // 🔇 mute
  if (cmd === "!mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("❌ Pas la permission.");

    const member = message.mentions.members.first();
    if (!member) return message.reply("❌ Exemple : `!mute @pseudo 10`");

    const minutes = parseInt(args[2] || "10", 10);
    if (Number.isNaN(minutes) || minutes <= 0) return message.reply("❌ Minutes invalides.");

    await member.timeout(minutes * 60 * 1000, `Mute par ${message.author.tag}`);
    return message.reply(`🔇 <@${member.id}> mute **${minutes} min**.`);
  }

  // 🎖 role
  if (cmd === "!role") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return message.reply("❌ Pas la permission.");

    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply("❌ Exemple : `!role @pseudo @role`");

    await member.roles.add(role);
    return message.reply(`✅ Rôle **${role.name}** ajouté à <@${member.id}>.`);
  }

  // 🟢 prise
  if (cmd === "!prise") {
    data = loadData(); // recharge (safe)
    if (data.service[message.author.id]) return message.reply("❌ Tu es déjà en service.");

    data.service[message.author.id] = Date.now();
    saveData(data);

    const log = message.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (log) log.send(`🟢 **PRISE** - <@${message.author.id}> a pris son service.`);

    return message.reply("🟢 Service commencé !");
  }

  // 🔴 fin
  if (cmd === "!fin") {
    data = loadData(); // recharge (safe)
    const start = data.service[message.author.id];
    if (!start) return message.reply("❌ Tu n’es pas en service.");

    const duree = Date.now() - start;
    delete data.service[message.author.id];

    data.totals[message.author.id] = (data.totals[message.author.id] || 0) + duree;
    saveData(data);

    const log = message.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (log) log.send(`🔴 **FIN** - <@${message.author.id}> fin de service | Temps: **${formatDuree(duree)}**`);

    return message.reply(`🔴 Service terminé. Temps : **${formatDuree(duree)}**`);
  }

  // 📊 stats
  if (cmd === "!stats") {
    const fresh = loadData();
    const target = message.mentions.users.first() || message.author;
    const total = fresh.totals?.[target.id] || 0;
    return message.reply(`📊 Temps total EMS de <@${target.id}> : **${formatDuree(total)}**`);
  }

// =========================
// 🔝 TOP EMS
// =========================
if (cmd === "!topems") {
  const fresh = loadData();
  const totals = fresh.totals || {};

  const entries = Object.entries(totals)
    .map(([userId, ms]) => ({ userId, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10);

  if (entries.length === 0) return message.reply("📊 Aucun temps enregistré pour l’instant.");

  const lines = entries.map((e, i) => `${i + 1}. <@${e.userId}> — **${formatDuree(e.ms)}**`);
  return message.reply(`🏆 **TOP EMS**\n${lines.join("\n")}`);
}

// =========================
// 🧹 RESET STATS (ADMIN)
// =========================
if (cmd === "!resetstats") {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
    return message.reply("❌ Admin uniquement.");

  const fresh = loadData();
  fresh.totals = {};
  fresh.service = {};
  saveData(fresh);

  return message.reply("✅ Stats EMS reset (totaux + services en cours).");
}
});

=======
require("dotenv").config();
const fs = require("fs-extra");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const DATA_FILE = "./data.json";

function formatDuree(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}min`;
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeJsonSync(DATA_FILE, { service: {}, totals: {} }, { spaces: 2 });
    }
    const parsed = fs.readJsonSync(DATA_FILE);
    parsed.service ??= {};
    parsed.totals ??= {};
    return parsed;
  } catch (e) {
    console.log("❌ Erreur data.json -> reset :", e.message);
    const safe = { service: {}, totals: {} };
    fs.writeJsonSync(DATA_FILE, safe, { spaces: 2 });
    return safe;
  }
}

function saveData(d) {
  try {
    fs.writeJsonSync(DATA_FILE, d, { spaces: 2 });
  } catch (e) {
    console.log("❌ Impossible d'écrire data.json :", e.message);
  }
}

let data = loadData();

client.on("ready", () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  // !ping
  if (cmd === "!ping") return message.reply("🏓 Pong !");

  // 🎫 ticket
  if (cmd === "!ticket") {
    const EMS_ROLE_ID = process.env.EMS_ROLE_ID;
    const CATEGORY_ID = process.env.TICKET_CATEGORY_ID;

    if (!EMS_ROLE_ID) return message.reply("❌ EMS_ROLE_ID manquant dans .env");

    const existing = message.guild.channels.cache.find(
      c => c.name === `ticket-${message.author.id}`
    );
    if (existing) return message.reply("🎫 Tu as déjà un ticket ouvert.");

    const channel = await message.guild.channels.create({
      name: `ticket-${message.author.id}`,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID || null,
      permissionOverwrites: [
        { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: EMS_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      ],
    });

    await channel.send(`🚑 <@&${EMS_ROLE_ID}> nouveau ticket EMS !`);
    return channel.send(`🎫 Ticket créé pour <@${message.author.id}>.\nUtilise **!close** pour fermer.`);
  }

  // ❌ close
  if (cmd === "!close") {
    const EMS_ROLE_ID = process.env.EMS_ROLE_ID;

    if (!message.channel.name.startsWith("ticket-"))
      return message.reply("❌ Utilise ça dans un ticket.");

    const isEms = EMS_ROLE_ID && message.member.roles.cache.has(EMS_ROLE_ID);
    const isOwner = message.channel.name === `ticket-${message.author.id}`;

    if (!isEms && !isOwner) return message.reply("❌ Seuls les EMS (ou le créateur) peuvent fermer.");

    await message.channel.send("✅ Ticket fermé.");
    return message.channel.delete().catch(() => {});
  }

  // 🔇 mute
  if (cmd === "!mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("❌ Pas la permission.");

    const member = message.mentions.members.first();
    if (!member) return message.reply("❌ Exemple : `!mute @pseudo 10`");

    const minutes = parseInt(args[2] || "10", 10);
    if (Number.isNaN(minutes) || minutes <= 0) return message.reply("❌ Minutes invalides.");

    await member.timeout(minutes * 60 * 1000, `Mute par ${message.author.tag}`);
    return message.reply(`🔇 <@${member.id}> mute **${minutes} min**.`);
  }

  // 🎖 role
  if (cmd === "!role") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return message.reply("❌ Pas la permission.");

    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply("❌ Exemple : `!role @pseudo @role`");

    await member.roles.add(role);
    return message.reply(`✅ Rôle **${role.name}** ajouté à <@${member.id}>.`);
  }

  // 🟢 prise
  if (cmd === "!prise") {
    data = loadData(); // recharge (safe)
    if (data.service[message.author.id]) return message.reply("❌ Tu es déjà en service.");

    data.service[message.author.id] = Date.now();
    saveData(data);

    const log = message.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (log) log.send(`🟢 **PRISE** - <@${message.author.id}> a pris son service.`);

    return message.reply("🟢 Service commencé !");
  }

  // 🔴 fin
  if (cmd === "!fin") {
    data = loadData(); // recharge (safe)
    const start = data.service[message.author.id];
    if (!start) return message.reply("❌ Tu n’es pas en service.");

    const duree = Date.now() - start;
    delete data.service[message.author.id];

    data.totals[message.author.id] = (data.totals[message.author.id] || 0) + duree;
    saveData(data);

    const log = message.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (log) log.send(`🔴 **FIN** - <@${message.author.id}> fin de service | Temps: **${formatDuree(duree)}**`);

    return message.reply(`🔴 Service terminé. Temps : **${formatDuree(duree)}**`);
  }

  // 📊 stats
  if (cmd === "!stats") {
    const fresh = loadData();
    const target = message.mentions.users.first() || message.author;
    const total = fresh.totals?.[target.id] || 0;
    return message.reply(`📊 Temps total EMS de <@${target.id}> : **${formatDuree(total)}**`);
  }

// =========================
// 🔝 TOP EMS
// =========================
if (cmd === "!topems") {
  const fresh = loadData();
  const totals = fresh.totals || {};

  const entries = Object.entries(totals)
    .map(([userId, ms]) => ({ userId, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10);

  if (entries.length === 0) return message.reply("📊 Aucun temps enregistré pour l’instant.");

  const lines = entries.map((e, i) => `${i + 1}. <@${e.userId}> — **${formatDuree(e.ms)}**`);
  return message.reply(`🏆 **TOP EMS**\n${lines.join("\n")}`);
}

// =========================
// 🧹 RESET STATS (ADMIN)
// =========================
if (cmd === "!resetstats") {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
    return message.reply("❌ Admin uniquement.");

  const fresh = loadData();
  fresh.totals = {};
  fresh.service = {};
  saveData(fresh);

  return message.reply("✅ Stats EMS reset (totaux + services en cours).");
}
});

>>>>>>> 9d8b1b298026da8eb7d8f786098d7f6224838c6e
client.login(process.env.TOKEN);