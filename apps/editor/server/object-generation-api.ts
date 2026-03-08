import { fal } from "@fal-ai/client";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import {
  createGeneratedModelName,
  isObjectGenerationRequest,
  type ObjectGenerationRequest,
  type ObjectGenerationResponse
} from "../src/lib/object-generation-contract";

const API_PATH = "/api/ai/models";
const MODEL_ID = "fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d";

export function createObjectGenerationApiPlugin(): Plugin {
  return {
    configurePreviewServer(server) {
      registerObjectApi(server);
    },
    configureServer(server) {
      registerObjectApi(server);
    },
    name: "object-generation-api"
  };
}

function registerObjectApi(server: Pick<ViteDevServer, "middlewares"> | Pick<PreviewServer, "middlewares">) {
  server.middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split("?")[0];

    if (pathname !== API_PATH) {
      next();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    try {
      const rawBody = await readBody(req);
      const parsed = JSON.parse(rawBody) as unknown;

      if (!isObjectGenerationRequest(parsed)) {
        sendJson(res, 400, { error: "Invalid model generation request." });
        return;
      }

      const payload = await generateModel(parsed);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, {
        error:
          error instanceof Error
            ? error.message
            : "Model generation failed."
      });
    }
  });
}

async function generateModel(
  request: ObjectGenerationRequest
): Promise<ObjectGenerationResponse> {
  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    throw new Error("Missing FAL_KEY in the server environment.");
  }

  fal.config({
    credentials: apiKey
  });

  const result = await fal.subscribe(MODEL_ID, {
    input: {
      enable_pbr: true,
      prompt: request.prompt
    },
    logs: false
  });

  const generatedAsset = extractGeneratedAsset(result);

  if (!generatedAsset?.modelObj?.url) {
    throw new Error("Fal did not return an OBJ model.");
  }

  return {
    asset: {
      modelDataUrl: await fetchAsDataUrl(
        generatedAsset.modelObj.url,
        generatedAsset.modelObj.content_type ?? "model/obj"
      ),
      modelMimeType: generatedAsset.modelObj.content_type ?? "model/obj",
      model: MODEL_ID,
      name: createGeneratedModelName(request.prompt),
      prompt: request.prompt,
      textureDataUrl: generatedAsset.texture?.url
        ? await fetchAsDataUrl(
            generatedAsset.texture.url,
            generatedAsset.texture.content_type ?? "image/png"
          )
        : undefined,
      textureMimeType: generatedAsset.texture?.content_type
    }
  };
}

function extractGeneratedAsset(result: unknown) {
  if (
    typeof result !== "object" ||
    !result ||
    !("data" in result) ||
    typeof result.data !== "object" ||
    !result.data
  ) {
    return undefined;
  }

  const data = result.data as {
    model_obj?: { content_type?: string; url?: string };
    model_urls?: {
      obj?: { content_type?: string; url?: string };
      texture?: { content_type?: string; url?: string };
    };
    texture?: { content_type?: string; url?: string };
  };

  return {
    modelObj: data.model_urls?.obj ?? data.model_obj,
    texture: data.model_urls?.texture ?? data.texture
  };
}

async function fetchAsDataUrl(url: string, mimeType: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download generated model: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return `data:${mimeType};base64,${base64}`;
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
