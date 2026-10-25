// Minimal runtime contract for local SDK/entrypoint type checking, not a Deno installation.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): unknown
}
