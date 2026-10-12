
const express = require("express");
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");

const app = express();
app.use(express.json());
const API_KEY = process.env.API_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const commandes = [
  new SlashCommandBuilder()
    .setName("lier")
    .setDescription("Lier ton compte Roblox à Discord")
    .addStringOption(option =>
      option.setName("pseudo")
        .setDescription("Ton pseudo Roblox")
        .setRequired(true)
    )
].map(command => command.toJSON());

client.once("ready", async () => {
  console.log(`Bot connecté : ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commandes }
    );
    console.log("Commande /lier enregistrée !");
  } catch (error) {
    console.error(error);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "lier") return;

  const pseudo = interaction.options.getString("pseudo", true);

  await interaction.reply({
    content: `Tu as demandé à lier le compte Roblox **${pseudo}**. La vérification du compte sera ajoutée ensuite.`,
    ephemeral: true
  });
});

app.get("/", (req, res) => {
  res.send("Service de whitelist en ligne !");
});

app.get("/whitelist/:userId", async (req, res) => {
  if (req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const member = await guild.members.fetch(req.params.userId);
    const allowed = member.roles.cache.has(process.env.DISCORD_ROLE_ID);

    res.json({ allowed });
  } catch (error) {
    res.status(404).json({ allowed: false });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Serveur web démarré !");
});

client.login(process.env.DISCORD_TOKEN);
