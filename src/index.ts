// ----- Webhook server -----
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.send("OK"));

if (BASE_URL) {
  // Webhook mode (production)
  app.use(`/${BOT_TOKEN}`, webhookCallback(bot, "express"));
  app.listen(PORT, async () => {
    console.log(`Server on :${PORT}`);
    try {
      const url = `${BASE_URL}/${BOT_TOKEN}`;
      await bot.api.setWebhook(url);
      console.log("Webhook set to", url);
    } catch (e) {
      console.error("Failed to set webhook", e);
    }
  });
} else {
  // Local dev: long polling, no webhook middleware
  app.listen(PORT, () => console.log(`Server on :${PORT}`));
  bot.start();
}


