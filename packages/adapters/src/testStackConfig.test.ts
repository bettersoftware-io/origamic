import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// biome-ignore lint/style/noRestrictedImports: the tool is in tools/, outside every package, where no #/ alias reaches; this test holds its rule because tools/ has no test runner
import { testStackConfig } from "../../../tools/supabase/testStack.mts";

// The test stack's config is made from the committed one, so that the two
// stacks never share a container, a volume or a port. Only the project id and
// the ports differ.
describe("the test stack's config", () => {
  it("names a project of its own", () => {
    const config = testStackConfig('project_id = "origamic"\n');

    expect(config).toContain('project_id = "origamic-test"');
    expect(config).not.toContain('project_id = "origamic"\n');
  });

  it("moves every port the committed config names by the offset", () => {
    const config = testStackConfig(
      [
        'project_id = "origamic"',
        "[api]",
        "port = 54321",
        "[db]",
        "port = 54322",
        "shadow_port = 54320",
        "[db.pooler]",
        "enabled = false",
        "port = 54329",
        "[local_smtp]",
        "port = 54324",
        "smtp_port = 54325",
      ].join("\n"),
    );

    expect(portsOf(config)).toEqual(
      expect.objectContaining({
        "api.port": 54421,
        "db.port": 54422,
        "db.shadow_port": 54420,
        "db.pooler.port": 54429,
        "local_smtp.port": 54424,
        "local_smtp.smtp_port": 54425,
      }),
    );
  });

  it("names, moved, every port the stack publishes that the committed config leaves to the CLI", () => {
    const config = testStackConfig(
      [
        'project_id = "origamic"',
        "[api]",
        "enabled = true",
        "[studio]",
        "enabled = false",
      ].join("\n"),
    );

    expect(portsOf(config)).toEqual({
      "api.port": 54421,
      "db.port": 54422,
      "db.shadow_port": 54420,
      "db.pooler.port": 54429,
      "studio.port": 54423,
      "local_smtp.port": 54424,
      "edge_runtime.inspector_port": 8183,
      "analytics.port": 54427,
    });
  });

  it("leaves a port that is not the stack's alone: the mail server auth sends through", () => {
    const config = testStackConfig(
      ['project_id = "origamic"', "[auth.email.smtp]", "port = 587"].join("\n"),
    );

    expect(portsOf(config)["auth.email.smtp.port"]).toBe(587);
  });

  it("keeps everything else of the committed config as it is", () => {
    const config = testStackConfig(
      [
        "# A comment",
        'project_id = "origamic"',
        "",
        "[auth]",
        'site_url = "http://127.0.0.1:5173"',
        "minimum_password_length = 6",
      ].join("\n"),
    );

    expect(config).toContain("# A comment");
    expect(config).toContain('site_url = "http://127.0.0.1:5173"');
    expect(config).toContain("minimum_password_length = 6");
  });

  it("refuses a config with no project id", () => {
    expect(() => {
      return testStackConfig("[api]\nport = 54321\n");
    }).toThrow("project_id");
  });

  it("shares no port with the committed config", () => {
    const committed = readFileSync(
      join(import.meta.dirname, "..", "supabase", "config.toml"),
      "utf8",
    );
    const devPorts = new Set(Object.values(portsOf(committed)));
    const testPorts = Object.values(portsOf(testStackConfig(committed)));

    expect(testPorts.length).toBeGreaterThan(0);
    expect(
      testPorts.filter((port) => {
        return devPorts.has(port);
      }),
    ).toEqual([]);
  });
});

/** Each `*port = <number>` key of a TOML text, by `section.key`. */
function portsOf(config: string): Record<string, number> {
  const ports: Record<string, number> = {};
  let section = "";

  for (const line of config.split("\n")) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    const port = /^\s*(\w*port)\s*=\s*(\d+)/.exec(line);

    if (header?.[1] !== undefined) {
      section = header[1];
    } else if (port?.[1] !== undefined && port[2] !== undefined) {
      ports[`${section}.${port[1]}`] = Number(port[2]);
    }
  }

  return ports;
}
