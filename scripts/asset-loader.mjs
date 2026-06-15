export async function load(url, context, defaultLoad) {
  if (url.match(/\.(png|jpg|jpeg|svg)$/)) {
    return { format: "module", shortCircuit: true, source: "export default \"\";" };
  }
  if (url.endsWith(".jsx")) {
    const fs = await import("node:fs/promises");
    return { format: "module", shortCircuit: true, source: await fs.readFile(new URL(url), "utf8") };
  }
  return defaultLoad(url, context, defaultLoad);
}
