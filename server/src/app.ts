import express, { Application } from "express";
import cors from "cors";
import { notesRouter } from "./routes/notes";
import { usersRouter } from "./routes/users";
import { rowsRouter } from "./routes/rows";

export function createApp(): Application {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/notes", notesRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/rows", rowsRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
