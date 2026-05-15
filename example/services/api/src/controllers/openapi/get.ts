import type { ControllerModule } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";
import { createOpenApiDocument } from "../../utils/openapi.ts";

const controller: ControllerModule = {
  openapi: {
    summary: "OpenAPI document",
    responses: {
      "200": {
        description: "OpenAPI JSON",
      },
    },
  },
  handler: async ({ response }) => {
    sendJson(response, 200, await createOpenApiDocument());
  },
};

export default controller;
