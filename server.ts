import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import path from "path";
import 'dotenv/config';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Email Notification API Route
  app.post("/api/notify", async (req, res) => {
    try {
      const { type, electionTitle, recipients } = req.body;
      
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        return res.status(500).json({ error: "RESEND_API_KEY environment variable is missing" });
      }
      
      const resend = new Resend(resendKey);
      
      let subject = "";
      let html = "";
      
      if (type === "start") {
        subject = `🎉 Election Started: ${electionTitle}`;
        html = `<p>The election <strong>${electionTitle}</strong> has officially started. Please log in to cast your vote!</p>`;
      } else if (type === "end") {
        subject = `🛑 Election Ended: ${electionTitle}`;
        html = `<p>The election <strong>${electionTitle}</strong> has officially ended. Thank you to everyone who participated.</p>`;
      } else if (type === "results") {
        subject = `📊 Results Published: ${electionTitle}`;
        html = `<p>The results for the election <strong>${electionTitle}</strong> have been published! Log in to see the final outcomes.</p>`;
      } else {
         return res.status(400).json({ error: "Invalid notification type" });
      }

      if (!recipients || recipients.length === 0) {
        return res.status(400).json({ error: "No recipients provided" });
      }

      // Validating recipients as Resend allows max 50 for BCC or multi-send
      // To bypass batching complexity for this app, we will use BCC and slice up to 50
      const sendPromises = [];
      const CHUNK_SIZE = 49; // 1 'to' + 49 'bcc' = 50 total per request

      for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
        const chunk = recipients.slice(i, i + CHUNK_SIZE);
        sendPromises.push(
          resend.emails.send({
            from: 'Election Notifications <onboarding@resend.dev>', // Resend sandbox domain
            to: chunk[0],
            bcc: chunk.length > 1 ? chunk.slice(1) : undefined,
            subject,
            html,
          })
        );
      }

      const results = await Promise.all(sendPromises);
      
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        return res.status(400).json({ error: "Some emails failed to send", details: errors });
      }
      
      res.json({ success: true, message: `Sent ${recipients.length} emails successfully.` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
