import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stagingConfigurations = [
  {
    file: "docker/edge/staging-templates/default.conf.template",
    upstream: "si-cuti-staging-app:3000",
  },
  {
    file: "docker/edge/templates/default.conf.template",
    upstream: "si-cuti-staging-app:3000",
  },
] as const;

const applicationConfigurations = [
  {
    file: "docker/edge/staging-templates/default.conf.template",
    upstream: "si-cuti-staging-app:3000",
  },
  {
    file: "docker/edge/templates/default.conf.template",
    upstream: "si-cuti-production-app:3000",
  },
  {
    file: "docker/edge/templates/default.conf.template",
    upstream: "si-cuti-staging-app:3000",
  },
] as const;

const reconcileHelper = readFileSync(
  "scripts/staging-edge-reconcile.sh",
  "utf8",
);

function extractShellFunction(name: string, nextName: string): string {
  const start = reconcileHelper.indexOf(`${name}() {`);
  const end = reconcileHelper.indexOf(`${nextName}() {`, start);

  if (start === -1 || end === -1) {
    throw new Error(`Could not extract ${name} from staging edge helper`);
  }

  return reconcileHelper.slice(start, end);
}

const assertRouteFunction = extractShellFunction(
  "assert_route",
  "safe_env_value",
);

function runHelperRouteAssertion(configuration: string, route: string) {
  const directory = mkdtempSync(join(tmpdir(), "si-cuti-edge-route-"));
  const configurationFile = join(directory, "nginx.conf");
  writeFileSync(configurationFile, configuration);

  try {
    return spawnSync(
      "sh",
      [
        "-c",
        `UPSTREAM=http://si-cuti-staging-app:3000\n${assertRouteFunction}\nassert_route "$1" "$2"`,
        "assert-route",
        configurationFile,
        route,
      ],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("edge routing", () => {
  it.each(["^~ /api/", "= /admin", "^~ /admin/", "/"])(
    "uses system awk to match the literal location declaration %s",
    (route) => {
      const result = runHelperRouteAssertion(
        `server {\n  location ${route} {\n    proxy_pass http://si-cuti-staging-app:3000;\n  }\n}\n`,
        route,
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
  );

  it("does not treat ^~ in a route token as regular-expression syntax", () => {
    const result = runHelperRouteAssertion(
      "server {\n  location anything /api/ {\n    proxy_pass http://si-cuti-staging-app:3000;\n  }\n}\n",
      "^~ /api/",
    );

    expect(result.status).not.toBe(0);
  });

  it("fails helper validation when the expected upstream is absent", () => {
    const result = runHelperRouteAssertion(
      "server {\n  location ^~ /api/ {\n    proxy_pass http://another-service:3000;\n  }\n}\n",
      "^~ /api/",
    );

    expect(result.status).not.toBe(0);
  });

  it.each(applicationConfigurations)(
    "forwards exact /admin to the expected Next.js service in $file",
    ({ file, upstream }) => {
      const configuration = readFileSync(file, "utf8");
      const adminLocations = [
        ...configuration.matchAll(
          /location = \/admin\s*\{(?<body>[\s\S]*?)\}/g,
        ),
      ];

      expect(
        adminLocations.some(({ groups }) =>
          groups?.body.includes(`proxy_pass http://${upstream};`),
        ),
      ).toBe(true);
    },
  );

  it.each(stagingConfigurations)(
    "forwards /admin/ to the staging Next.js service in $file",
    ({ file, upstream }) => {
      const configuration = readFileSync(file, "utf8");
      const adminLocations = [
        ...configuration.matchAll(
          /location \^~ \/admin\/\s*\{(?<body>[\s\S]*?)\}/g,
        ),
      ];

      expect(
        adminLocations.some(({ groups }) =>
          groups?.body.includes(`proxy_pass http://${upstream};`),
        ),
      ).toBe(true);
    },
  );

  it.each(stagingConfigurations)(
    "retains a catch-all application route in $file",
    ({ file, upstream }) => {
      const configuration = readFileSync(file, "utf8");
      const catchAllLocations = [
        ...configuration.matchAll(/location \/\s*\{(?<body>[\s\S]*?)\}/g),
      ];

      expect(
        catchAllLocations.some(({ groups }) =>
          groups?.body.includes(`proxy_pass http://${upstream};`),
        ),
      ).toBe(true);
    },
  );

  it.each(applicationConfigurations)(
    "forwards /api/ to the expected Next.js service in $file",
    ({ file, upstream }) => {
      const configuration = readFileSync(file, "utf8");
      const apiLocations = [
        ...configuration.matchAll(
          /location \^~ \/api\/\s*\{(?<body>[\s\S]*?)\}/g,
        ),
      ];

      expect(
        apiLocations.some(({ groups }) =>
          groups?.body.includes(`proxy_pass http://${upstream};`),
        ),
      ).toBe(true);
    },
  );

  it.each([
    "docker/edge/staging-templates/default.conf.template",
    "docker/edge/templates/default.conf.template",
  ])("does not redirect /admin to /admin/ in $file", (file) => {
    const configuration = readFileSync(file, "utf8");

    expect(configuration).not.toMatch(
      /location = \/admin\s*\{[\s\S]*?return\s+30[18]\s+\/admin\/;/,
    );
  });
});
