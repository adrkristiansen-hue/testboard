// OpenAPI 3.1 description of the REST API (served at /api/v1/openapi.json, rendered at /api/docs).

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const err = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });
const idParam = { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Work item ID" };
const projectParam = { name: "projectId", in: "path", required: true, schema: { type: "string" }, description: "Project id or key (e.g. HRS)" };

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "TestBoard REST API",
    version: "1.0.0",
    description:
      "Read and write work items in TestBoard. Authenticate with a personal API token (user menu → API tokens): `Authorization: Bearer tb_…`. A token acts as its owner, with the owner's role: read-only users can only read, and deleting requires Admin or Test Lead. Workflow rules apply exactly as in the UI. Values use human-readable names: type keys (DEFECT, TEST_TASK…), state names, user e-mails, module paths (\"Employee Central > Hire\") and phase names.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/me": {
      get: { summary: "The token's user", tags: ["General"], responses: { 200: { description: "User", content: { "application/json": { schema: ref("User") } } }, 401: err("Missing or invalid token") } },
    },
    "/projects": {
      get: { summary: "List projects", tags: ["General"], responses: { 200: { description: "Projects", content: { "application/json": { schema: { type: "object", properties: { projects: { type: "array", items: ref("Project") } } } } } }, 401: err("Missing or invalid token") } },
    },
    "/projects/{projectId}/meta": {
      get: {
        summary: "Valid values for a project",
        description: "Types with states, transitions and custom fields; module paths; phases; users.",
        tags: ["General"],
        parameters: [projectParam],
        responses: { 200: { description: "Project metadata" }, 404: err("Project not found") },
      },
    },
    "/projects/{projectId}/workitems": {
      get: {
        summary: "List work items",
        tags: ["Work items"],
        parameters: [
          projectParam,
          { name: "type", in: "query", schema: { type: "string" }, description: "Type key or name" },
          { name: "state", in: "query", schema: { type: "string" } },
          { name: "assignedTo", in: "query", schema: { type: "string" }, description: "E-mail, full name, `me` or `none`" },
          { name: "module", in: "query", schema: { type: "string" }, description: "Module path or unique name; includes sub-modules" },
          { name: "phase", in: "query", schema: { type: "string" } },
          { name: "changedSince", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "q", in: "query", schema: { type: "string" }, description: "Text in title or description" },
          { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          200: { description: "Page of work items, ordered by ID", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: ref("WorkItem") }, total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } } } } },
          422: err("Unknown filter value"),
        },
      },
      post: {
        summary: "Create a work item",
        tags: ["Work items"],
        parameters: [projectParam],
        requestBody: { required: true, content: { "application/json": { schema: ref("WorkItemInput"), example: { type: "DEFECT", title: "Probation end date wrong", module: "Employee Central > Hire", phase: "SIT 2", assignedTo: "nora.lindeberg@demo.test", severity: 2, fields: { environment: "TEST" } } } } },
        responses: { 201: { description: "Created", content: { "application/json": { schema: ref("WorkItem") } } }, 400: err("Invalid body"), 403: err("Read-only user"), 422: err("Unknown value or workflow violation") },
      },
    },
    "/workitems/{id}": {
      get: { summary: "Get a work item", tags: ["Work items"], parameters: [idParam], responses: { 200: { description: "Work item", content: { "application/json": { schema: ref("WorkItem") } } }, 404: err("Not found") } },
      patch: {
        summary: "Update a work item",
        description: "Only the given fields change. State changes must be allowed by the type's workflow. `fields` is merged with existing custom field values.",
        tags: ["Work items"],
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: ref("WorkItemInput"), example: { state: "Active", assignedTo: "me@example.com" } } } },
        responses: { 200: { description: "Updated work item plus `changedFields`" }, 403: err("Read-only user"), 404: err("Not found"), 422: err("Unknown value or workflow violation") },
      },
      delete: { summary: "Delete a work item", tags: ["Work items"], parameters: [idParam], responses: { 204: { description: "Deleted" }, 403: err("Requires Admin or Test Lead"), 404: err("Not found") } },
    },
    "/workitems/{id}/comments": {
      get: { summary: "List comments", tags: ["Comments"], parameters: [idParam], responses: { 200: { description: "Comments, oldest first" }, 404: err("Not found") } },
      post: {
        summary: "Add a comment",
        tags: ["Comments"],
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["text"], properties: { text: { type: "string", maxLength: 20000 } } } } } },
        responses: { 201: { description: "Created comment" }, 403: err("Read-only user"), 404: err("Not found") },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Personal API token (tb_…)" } },
    schemas: {
      Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
      User: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" }, role: { type: "string", enum: ["ADMIN", "TEST_LEAD", "MEMBER", "READ_ONLY"] } } },
      Project: { type: "object", properties: { id: { type: "string" }, key: { type: "string" }, name: { type: "string" }, description: { type: ["string", "null"] }, workItemCount: { type: "integer" } } },
      WorkItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          project: { type: "string", description: "Project key" },
          type: { type: "string", description: "Type key" },
          title: { type: "string" },
          state: { type: "string" },
          stateCategory: { type: ["string", "null"], enum: ["PROPOSED", "IN_PROGRESS", "RESOLVED", "COMPLETED", "REMOVED", null] },
          assignedTo: { type: ["object", "null"], properties: { email: { type: "string" }, name: { type: "string" } } },
          module: { type: ["string", "null"], description: "Module path" },
          phase: { type: ["string", "null"] },
          priority: { type: "integer", minimum: 1, maximum: 4 },
          severity: { type: ["integer", "null"], minimum: 1, maximum: 4 },
          tags: { type: "array", items: { type: "string" } },
          dueDate: { type: ["string", "null"], format: "date" },
          parentId: { type: ["integer", "null"] },
          description: { type: ["string", "null"], description: "Plain text" },
          fields: { type: "object", additionalProperties: true, description: "Custom field values by key (e.g. steps, outcome, environment)" },
          createdAt: { type: "string", format: "date-time" },
          changedAt: { type: "string", format: "date-time" },
          url: { type: "string", description: "Link to the work item in TestBoard" },
        },
      },
      WorkItemInput: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", description: "Type key or name. Required on create; cannot be changed." },
          title: { type: "string", maxLength: 255, description: "Required on create" },
          state: { type: "string" },
          assignedTo: { type: ["string", "null"], description: "E-mail or full name" },
          module: { type: ["string", "null"], description: "Module path or unique name" },
          phase: { type: ["string", "null"] },
          priority: { type: "integer", minimum: 1, maximum: 4 },
          severity: { type: ["integer", "null"], minimum: 1, maximum: 4 },
          tags: { type: "array", items: { type: "string" } },
          dueDate: { type: ["string", "null"], description: "yyyy-mm-dd or dd.mm.yyyy" },
          parentId: { type: ["integer", "null"] },
          description: { type: ["string", "null"], description: "Plain text" },
          fields: { type: "object", additionalProperties: true },
        },
      },
    },
  },
} as const;
