import type { ControllerModule } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

const controller: ControllerModule = {
  openapi: {
    summary: "Health check",
    responses: {
      "200": {
        description: "Server health",
      },
    },
  },
  handler: async ({ context, response }) => {
    sendJson(response, 200, {
      status: "ok",
      alive: context.lifecycle.alive,
    });
  },
};

export default controller;
