import express from "express";

const PORT = Number(process.env.VERIFY_PORT ?? 8084);
const PLATFORM_ID = process.env.PLATFORM_ID ?? "unknown";

const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "verify", platform_id: PLATFORM_ID });
});

const server = app.listen(PORT, () => {
  console.log(JSON.stringify({ service: "verify", port: PORT, platform_id: PLATFORM_ID }));
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
