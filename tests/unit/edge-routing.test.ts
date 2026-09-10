import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const configurations = [
  {
    file: "docker/edge/staging-templates/default.conf.template",
    upstream: "si-cuti-staging-app:3000",
  },
  {
    file: "docker/edge/templates/default.conf.template",
    upstream: "si-cuti-staging-app:3000",
  },
] as const;

describe("staging edge routing", () => {
  it.each(configurations)(
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

  it.each(configurations)(
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
});
