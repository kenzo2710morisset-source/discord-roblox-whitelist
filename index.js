
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
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Les codes restent temporaires ; les liaisons sont enregistrées dans Supabase.
const codes = new Map();

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

// Appels à l'API REST de Supabase
async function dbRequest(path, method = "GET", body = null, prefer = "") {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Configuration Supabase manquante");
  }

  const options = {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    }
  };

  if (prefer) options.headers.Prefer = prefer;
  if (body !== null) options.body = JSON.stringify(body);

  const response = await fetch(
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`,
    options
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
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

    const robloxId = entry.robloxId;
    const discordId = interaction.user.id;

    // Empêche un même compte Roblox ou Discord d'avoir plusieurs liaisons.
    // On supprime les anciennes liaisons correspondantes avant d'en créer une.
    const filters =
      `?or=(roblox_user_id.eq.${robloxId},discord_user_id.eq.${discordId})`;

    await dbRequest(
      `roblox_discord_links${filters}`,
      "DELETE",
      null,
      "return=minimal"
    );

    await dbRequest(
      "roblox_discord_links",
      "POST",
      {
        roblox_user_id: robloxId,
        discord_user_id: discordId
      },
      "return=minimal"
    );

    codes.delete(code);

    return interaction.reply({
      content: "Compte Roblox lié et sauvegardé ! Tu n'auras pas à le relier à chaque connexion.",
      ephemeral: true
    });
  } catch (error) {
    console.error("Erreur liaison :", error);
    return interaction.reply({
      content: "Impossible d'enregistrer la liaison. Réessaie plus tard.",
      ephemeral: true
    });
  }
});

app.get("/", (req, res) => {
  res.send("Service de whitelist en ligne !");
});

// Crée un code temporaire pour un compte Roblox.
app.post("/link/create", authorized, (req, res) => {
  const robloxId = String(req.body.robloxUserId || "");

  if (!/^\d{1,20}$/.test(robloxId)) {
    return res.status(400).json({ error: "Identifiant Roblox invalide" });
  }

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

// Vérifie si le compte Roblox est lié et si son Discord a le rôle requis.
app.get("/whitelist/:robloxUserId", authorized, async (req, res) => {
  const robloxId = String(req.params.robloxUserId);

  if (!/^\d{1,20}$/.test(robloxId)) {
    return res.status(400).json({ error: "Identifiant Roblox invalide" });
  }

  try {
    const rows = await dbRequest(
      `roblox_discord_links?select=discord_user_id&roblox_user_id=eq.${robloxId}`
    );

    if (!rows || rows.length === 0) {
      return res.json({ allowed: false, linked: false });
    }

    const discordId = rows[0].discord_user_id;

    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(discordId);
      const allowed = member.roles.cache.has(ROLE_ID);

      return res.json({ allowed, linked: true });
    } catch (error) {
      // La liaison est conservée même si le rôle a été retiré.
      return res.json({ allowed: false, linked: true });
    }
  } catch (error) {
    console.error("Erreur vérification Supabase :", error);
    return res.status(500).json({ error: "Vérification indisponible" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Serveur web démarré !");
});

client.login(process.env.DISCORD_TOKEN);
