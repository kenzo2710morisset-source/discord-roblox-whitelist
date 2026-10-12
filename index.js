const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.get("/", (req, res) => {
  res.send("Le service de whitelist fonctionne !");
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once("ready", () => {
  console.log(`Discord connecté : ${client.user.tag}`);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Serveur web démarré");
});

client.login(process.env.DISCORD_TOKEN);
