import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rollout = readFileSync("scripts/staging-rollout.sh", "utf8");
const edge = readFileSync("scripts/staging-edge-reconcile.sh", "utf8");

describe("staging provenance helpers", () => {
  it("refuses source drift and dirty worktrees without destructive Git cleanup", () => {
    expect(rollout).toContain("git fetch origin staging");
    expect(rollout).toContain('[ "$head_sha" = "$staging_sha" ]');
    expect(rollout).toContain("git status --porcelain --untracked-files=all");
    expect(rollout).not.toMatch(/git\s+reset/);
    expect(rollout).not.toMatch(/git\s+clean/);
    expect(rollout).not.toMatch(
      /rm\s+[^\n]*(--filter|--format|tsconfig\.tsbuildinfo)/,
    );
  });

  it("uses the approved build-free staging app recreation flags", () => {
    expect(rollout).toContain(
      "$COMPOSE up -d --no-deps --force-recreate --no-build --pull never app",
    );
    expect(rollout).toContain("docker image inspect --format '{{.Id}}'");
    expect(rollout).toContain("docker inspect --format '{{.Image}}'");
    expect(rollout).not.toMatch(/docker\s+(compose\s+)?build/);
    expect(rollout).not.toContain("down --volumes");
  });

  it("checks database identity read-only and never deletes a volume", () => {
    expect(rollout).toContain("SELECT current_database()");
    expect(rollout).toContain(
      "SELECT environment FROM deployment_control.environment_marker",
    );
    expect(rollout).toContain("si-cuti-staging_postgres_data");
    expect(rollout).toContain("INVESTIGATE ONLY");
    expect(rollout).not.toMatch(/docker\s+volume\s+rm/);
    expect(rollout).not.toMatch(/\b(DELETE|UPDATE|INSERT|TRUNCATE|DROP)\b/);
  });

  it("reconciles only staging edge and verifies effective routing", () => {
    expect(edge).toContain("-f compose.edge.staging.yaml");
    expect(edge).not.toContain("compose.edge.yaml");
    expect(edge).toContain("$COMPOSE up -d --no-deps --force-recreate edge");
    expect(edge).toContain("nginx -t");
    expect(edge).toContain("nginx -T");
    expect(edge).toContain("'^~ /api/'");
    expect(edge).toContain("'= /admin'");
    expect(edge).toContain("'^~ /admin/'");
    expect(edge).toContain("UPSTREAM=http://si-cuti-staging-app:3000");
    expect(edge).toContain("si-cuti-staging-frontend");
    expect(edge).toContain("staging-only helper menolak menyentuhnya");
  });
});
