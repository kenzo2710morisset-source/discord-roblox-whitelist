const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

app.get("/", (req, res) => {
  res.send("Service de whitelist en ligne !");
});

app.get("/whitelist/:userId", async (req, res) => {
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const member = await guild.members.fetch(req.params.userId);
    const allowed = member.roles.cache.has(process.env.DISCORD_ROLE_ID);

    res.json({ allowed });
  } catch (error) {
    res.status(404).json({ allowed: false });
  }
});

client.once("ready", () => {
  console.log("Bot Discord connecté !");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Serveur web démarré !");
});

client.login(process.env.DISCORD_TOKEN);
