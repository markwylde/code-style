import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestServer } from "../../helpers/createTestServer.js";

let stopServer: (() => Promise<void>) | undefined;
let baseUrl: string;

describe("notes API", () => {
  before(async () => {
    const { server, baseUrl: resolvedBaseUrl } = await createTestServer();
    stopServer = server.stop;
    baseUrl = resolvedBaseUrl;
  });

  after(async () => {
    if (stopServer) {
      await stopServer();
    }
  });

  it("creates, lists, and retrieves notes", async () => {
    const createResponse = await fetch(`${baseUrl}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Note",
        content: "Remember to write tests.",
      }),
    });

    assert.equal(createResponse.status, 201);
    const createdNote = await createResponse.json();
    assert.equal(createdNote.title, "Test Note");
    assert.equal(createdNote.content, "Remember to write tests.");
    assert.equal(typeof createdNote.id, "string");

    const listResponse = await fetch(`${baseUrl}/notes`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert(Array.isArray(listPayload.notes));
    assert(listPayload.notes.length >= 1);

    const getResponse = await fetch(`${baseUrl}/notes/${createdNote.id}`);
    assert.equal(getResponse.status, 200);
    const retrievedNote = await getResponse.json();
    assert.equal(retrievedNote.id, createdNote.id);
  });
});
