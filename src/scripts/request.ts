// A stalled connection must release the editor without retrying a possible write.
export async function requestJSON(
  url: string,
  options: RequestInit = {},
  timeoutMs = 45000,
) {
  const controller = new AbortController();
  const mutation = !["GET", "HEAD"].includes(options.method || "GET");
  const uncertain = mutation
    ? " Your changes are still here. The save may have reached the server; check the saved version before retrying."
    : " Please try again. Your unsaved changes are still here.";
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The request timed out." + uncertain));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        let response: Response;
        try {
          response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
        } catch {
          throw new Error("The connection was interrupted." + uncertain);
        }
        let data: any;
        try {
          data = await response.json();
        } catch {
          throw Object.assign(
            new Error("The server response could not be read." + uncertain),
            { status: response.status },
          );
        }
        if (!response.ok)
          throw Object.assign(new Error(data.error || "The request failed."), {
            status: response.status,
          });
        return data;
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
