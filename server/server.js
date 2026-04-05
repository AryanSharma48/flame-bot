import express from "express";
import dotenv from "dotenv";
import { runBot } from "./bot.js";

dotenv.config();

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
    const event = req.headers["x-github-event"];

    if (event === "push") {
        console.log("Push event received");

        await runBot(req.body);
    }

    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port {PORT}`);
});