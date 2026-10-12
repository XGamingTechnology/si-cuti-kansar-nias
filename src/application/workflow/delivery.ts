import { requireRequestPrincipal } from "@/application/authorization/http";
import type { WorkflowActor } from "./types";
import {
  actionInput,
  leaveInput,
  permissionInput,
  workflowErrorResponse,
} from "./http";
import { createWorkflowRuntime } from "@/infrastructure/workflow/runtime";

export type WorkflowRuntime = ReturnType<typeof createWorkflowRuntime>;
type Factory = () => WorkflowRuntime;
type Kind = "leave" | "permission";

function run(
  factory: Factory,
  operation: (
    runtime: WorkflowRuntime,
    actor: WorkflowActor,
    request: Request,
  ) => Promise<Response>,
) {
  return async (request: Request) => {
    const runtime = factory();
    try {
      const actor = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      return await operation(runtime, actor, request);
    } catch (error) {
      return (
        workflowErrorResponse(error) ??
        Response.json({ error: "Operasi alur kerja gagal." }, { status: 500 })
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export function createCollectionHandlers(
  kind: Kind,
  factory: Factory = createWorkflowRuntime,
) {
  return {
    GET: run(factory, async (runtime, actor) =>
      Response.json({
        requests: await runtime[kind].list(actor),
      }),
    ),
    POST: run(factory, async (runtime, actor, request) =>
      Response.json(
        {
          request:
            kind === "leave"
              ? await runtime.leave.createDraft(
                  actor,
                  await leaveInput(request),
                )
              : await runtime.permission.createDraft(
                  actor,
                  await permissionInput(request),
                ),
        },
        { status: 201 },
      ),
    ),
  };
}

export function createDetailHandlers(
  kind: Kind,
  factory: Factory = createWorkflowRuntime,
) {
  return {
    GET: (request: Request, context: { params: Promise<{ id: string }> }) =>
      run(factory, async (runtime, actor) =>
        Response.json({
          request: await runtime[kind].get(actor, (await context.params).id),
        }),
      )(request),
    PATCH: (request: Request, context: { params: Promise<{ id: string }> }) =>
      run(factory, async (runtime, actor, incoming) =>
        Response.json({
          request:
            kind === "leave"
              ? await runtime.leave.updateDraft(
                  actor,
                  (await context.params).id,
                  await leaveInput(incoming),
                )
              : await runtime.permission.updateDraft(
                  actor,
                  (await context.params).id,
                  await permissionInput(incoming),
                ),
        }),
      )(request),
  };
}

export function createHistoryHandler(
  kind: Kind,
  resource: "revisions" | "history",
  factory: Factory = createWorkflowRuntime,
) {
  return (request: Request, context: { params: Promise<{ id: string }> }) =>
    run(factory, async (runtime, actor) =>
      Response.json({
        [resource]: await runtime[kind][resource](
          actor,
          (await context.params).id,
        ),
      }),
    )(request);
}

export function createActionHandler(
  kind: Kind,
  factory: Factory = createWorkflowRuntime,
) {
  return (request: Request, context: { params: Promise<{ id: string }> }) =>
    run(factory, async (runtime, actor, incoming) => {
      const id = (await context.params).id;
      const input = await actionInput(incoming);
      const service = runtime[kind];
      let transition;
      switch (input.action) {
        case "SUBMIT":
          transition = await service.submit(actor, id, input.idempotencyKey);
          break;
        case "CANCEL":
          transition = await service.cancel(actor, id, input.idempotencyKey);
          break;
        case "RETURN":
          transition = await service.returnForCorrection(
            actor,
            id,
            input.reason,
            input.idempotencyKey,
          );
          break;
        case "REJECT":
          transition = await service.reject(
            actor,
            id,
            input.reason,
            input.idempotencyKey,
          );
          break;
        case "APPROVE":
          transition = await service.approve(
            actor,
            id,
            input.evidenceReference,
            input.idempotencyKey,
          );
          break;
      }
      return Response.json({ transition });
    })(request);
}

export function createPermissionTypesHandler(
  factory: Factory = createWorkflowRuntime,
) {
  return run(factory, async (runtime, actor) =>
    Response.json({
      permissionTypes: await runtime.permission.activeTypes(actor),
    }),
  );
}
