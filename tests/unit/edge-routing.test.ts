import { readFileSync } from "node:fs";
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

describe("edge routing", () => {
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
});
