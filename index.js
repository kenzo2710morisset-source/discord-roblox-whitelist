
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "10kb" }));

const API_KEY = process.env.API_KEY;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const ROLE_ID = process.env.DISCORD_ROLE_ID;

// Codes temporaires et associations en mémoire
const codes = new Map();
const links = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const commandes = [
  new SlashCommandBuilder()
    .setName("lier")
    .setDescription("Lier ton compte Roblox")
    .addStringOption(option =>
      option.setName("code")
        .setDescription("Code obtenu dans le jeu Roblox")
        .setRequired(true)
    )
].map(command => command.toJSON());

function authorized(req, res, next) {
  if (!API_KEY || req.get("x-api-key") !== API_KEY) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  next();
}

client.once("ready", async () => {
  console.log(`Bot connecté : ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commandes }
    );

    console.log("Commande /lier enregistrée !");
  } catch (error) {
    console.error("Erreur commande Discord :", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "lier") return;

  const code = interaction.options.getString("code", true)
    .trim()
    .toUpperCase();

  const entry = codes.get(code);

  if (!entry || entry.expiresAt < Date.now()) {
    codes.delete(code);
    return interaction.reply({
      content: "Code invalide ou expiré. Demande un nouveau code dans Roblox.",
      ephemeral: true
    });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(ROLE_ID)) {
      return interaction.reply({
        content: "Tu dois avoir le rôle Whitelist pour lier ton compte.",
        ephemeral: true
      });
    }

    // Un compte Roblox ne peut être lié qu'à un seul Discord.
    for (const [discordId, robloxId] of links) {
      if (robloxId === entry.robloxId) links.delete(discordId);
    }

    links.set(interaction.user.id, entry.robloxId);
    codes.delete(code);

    return interaction.reply({
      content: "Compte Roblox lié ! Tu peux rejoindre le jeu.",
      ephemeral: true
    });
  } catch (error) {
    console.error("Erreur liaison :", error);
    return interaction.reply({
      content: "Impossible de vérifier ton rôle. Réessaie plus tard.",
      ephemeral: true
    });
  }
});

app.get("/", (req, res) => {
  res.send("Service de whitelist en ligne !");
});

// Roblox demande un code temporaire depuis un Script serveur.
app.post("/link/create", authorized, (req, res) => {
  const robloxId = String(req.body.robloxUserId || "");

  if (!/^\d{1,20}$/.test(robloxId)) {
    return res.status(400).json({ error: "Identifiant Roblox invalide" });
  }

  // Limite le nombre de codes actifs pour un même compte.
  for (const [code, entry] of codes) {
    if (entry.robloxId === robloxId) codes.delete(code);
  }

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();

  codes.set(code, {
    robloxId,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  res.json({ code, expiresInSeconds: 600 });
});

// Roblox vérifie l'accès d'un joueur lié.
app.get("/whitelist/:robloxUserId", authorized, async (req, res) => {
  const robloxId = String(req.params.robloxUserId);
  let discordId = null;

  for (const [id, linkedRobloxId] of links) {
    if (linkedRobloxId === robloxId) {
      discordId = id;
      break;
    }
  }

  if (!discordId) {
    return res.json({ allowed: false });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(discordId);
    const allowed = member.roles.cache.has(ROLE_ID);

    res.json({ allowed });
  } catch (error) {
    // En cas de doute ou d'erreur, l'accès est refusé.
    res.json({ allowed: false });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Serveur web démarré !");
});

client.login(process.env.DISCORD_TOKEN);
