import tokensCss from "./tokens.css?raw";

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function lightThemeTokens(): Map<string, string> {
  const block = tokensCss.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\}/u)?.[1];
  if (block === undefined) {
    throw new Error("Light theme token block is missing");
  }

  return new Map(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/giu)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

it("keeps light-theme subtle normal text at AA contrast on every surface", () => {
  const tokens = lightThemeTokens();
  const subtle = tokens.get("color-text-subtle");
  expect(subtle).toBeDefined();

  for (const backgroundName of [
    "color-canvas",
    "color-surface",
    "color-surface-raised",
    "color-surface-muted",
  ]) {
    const background = tokens.get(backgroundName);
    expect(background).toBeDefined();
    expect(
      contrast(subtle!, background!),
      `--color-text-subtle against --${backgroundName}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});
