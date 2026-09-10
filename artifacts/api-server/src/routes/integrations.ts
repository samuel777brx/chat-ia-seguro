import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

router.get("/integrations/github/repos", async (req, res) => {
  try {
    const response = await connectors.proxy("github", "/user/repos?sort=pushed&per_page=50", { method: "GET" });
    if (!response.ok) {
      res.status(response.status).json({ error: "Não foi possível carregar seus repositórios." });
      return;
    }
    const repos = (await response.json()) as Array<{ id: number; name: string; full_name: string; html_url: string; description: string | null }>;
    res.json(repos.map((repo) => ({ id: repo.id, name: repo.name, fullName: repo.full_name, url: repo.html_url, description: repo.description })));
  } catch (error) {
    req.log.error({ err: error }, "GitHub integration request failed");
    res.status(502).json({ error: "A conexão com o GitHub não respondeu." });
  }
});

router.get("/integrations/discord/guilds", async (req, res) => {
  try {
    const response = await connectors.proxy("discord", "/api/v10/users/@me/guilds?limit=100", { method: "GET" });
    if (!response.ok) {
      res.status(response.status).json({ error: "Não foi possível carregar seus servidores do Discord." });
      return;
    }
    const guilds = (await response.json()) as Array<{ id: string; name: string; icon: string | null }>;
    res.json(guilds.map((guild) => ({ id: guild.id, name: guild.name, icon: guild.icon })));
  } catch (error) {
    req.log.error({ err: error }, "Discord integration request failed");
    res.status(502).json({ error: "A conexão com o Discord não respondeu." });
  }
});

export default router;