export async function load(url, context, defaultLoad) {
  if (url.match(/\.(png|jpg|jpeg|svg)$/)) {
    return { format: "module", shortCircuit: true, source: "export default \"\";" };
  }
  return defaultLoad(url, context, defaultLoad);
}
