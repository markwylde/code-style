import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestServer } from "./helpers.ts";

test("todo API CRUD flow and OpenAPI route", async () => {
  const { app, config } = await createTestServer();

  try {
    const createdRes = await fetch(new URL("/todos", config.publicBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Write spec aligned code" }),
    });

    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()) as {
      id: string;
      completed: boolean;
    };
    assert.equal(created.completed, false);

    const listRes = await fetch(new URL("/todos", config.publicBaseUrl));
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as { todos: Array<{ id: string }> };
    assert.equal(list.todos.length, 1);

    const updateRes = await fetch(
      new URL(`/todos/${created.id}`, config.publicBaseUrl),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: true }),
      },
    );
    assert.equal(updateRes.status, 200);

    const openApiRes = await fetch(
      new URL("/openapi.json", config.publicBaseUrl),
    );
    assert.equal(openApiRes.status, 200);
    const openapi = (await openApiRes.json()) as {
      paths: Record<string, unknown>;
    };
    assert.ok(openapi.paths["/todos"]);
    assert.ok(openapi.paths["/todos/{todoId}"]);

    const deleteRes = await fetch(
      new URL(`/todos/${created.id}`, config.publicBaseUrl),
      {
        method: "DELETE",
      },
    );
    assert.equal(deleteRes.status, 204);
  } finally {
    await app.stop();
  }
});

test("restart rebinds on the same port and returns healthy state", async () => {
  const { app, config } = await createTestServer();

  try {
    const health1 = await fetch(new URL("/health", config.publicBaseUrl));
    const body1 = (await health1.json()) as { alive: boolean };
    assert.equal(body1.alive, true);

    await app.restart();

    const health2 = await fetch(new URL("/health", config.publicBaseUrl));
    const body2 = (await health2.json()) as { alive: boolean };
    assert.equal(body2.alive, true);
  } finally {
    await app.stop();
  }
});
