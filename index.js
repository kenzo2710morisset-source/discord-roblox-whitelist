
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const app = express();
app.use(express.json());

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_ROLE_ID = process.env.DISCORD_ROLE_ID;
const PORT = process.env.PORT || 3000;

const commands = [
  new SlashCommandBuilder()
    .setName("lier")
    .setDescription("Lier ton compte Roblox à Discord")
    .addStringOption(option =>
      option
        .setName("code")
        .setDescription("Code obtenu dans Roblox")
        .setRequired(true)
    )
].map(command => command.toJSON());

client.once("ready", async () => {
  console.log(`Bot connecté : ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        DISCORD_GUILD_ID
      ),
      { body: commands }
    );

    console.log("Commande /lier enregistrée.");
  } catch (error) {
    console.error("Erreur d'enregistrement des commandes :", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "lier") return;

  await interaction.reply({
    content: "Je vérifie ton code…",
    ephemeral: true
  });

  // Cette route doit exister dans ton backend Render.
  // Elle doit vérifier le code et renvoyer le résultat de liaison.
  try {
    const response = await fetch(
      `${process.env.API_BASE_URL}/link/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.API_KEY
        },
        body: JSON.stringify({
          code: interaction.options.getString("code"),
          discordUserId: interaction.user.id
        })
      }
    );

    const result = await response.json();

    if (!response.ok || result.success !== true) {
      await interaction.editReply(
        "Code invalide ou expiré. Retourne dans Roblox pour obtenir un nouveau code."
      );
      return;
    }

    const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
    const member = await guild.members.fetch(interaction.user.id);

    await member.roles.add(DISCORD_ROLE_ID);

    await interaction.editReply(
      "Compte lié et rôle Whitelist attribué ! Tu peux retourner sur Roblox."
    );
  } catch (error) {
    console.error("Erreur de liaison :", error);

    await interaction.editReply(
      "Le service de liaison est indisponible. Réessaie plus tard."
    );
  }
});

app.get("/", (req, res) => {
  res.send("Service de whitelist en ligne !");
});

app.listen(PORT, () => {
  console.log(`Serveur web démarré sur le port ${PORT}`);
});

client.login(DISCORD_TOKEN);
