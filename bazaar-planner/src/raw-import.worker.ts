/// <reference lib="webworker" />
import { importRawCatalog } from "./raw-adapter";
self.onmessage = async (
  event: MessageEvent<{ text: string; fileName: string }>,
) => {
  try {
    const { text, fileName } = event.data;
    if (new TextEncoder().encode(text).byteLength > 25 * 1024 * 1024)
      throw Error("JSON 파일은 25MB 이하여야 합니다.");
    if (!crypto.subtle)
      throw Error("파일 변환은 HTTPS 또는 localhost에서 실행해야 합니다.");
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const result = importRawCatalog(JSON.parse(text.replace(/^\uFEFF/, "")), {
      fileName,
      sha256: digest,
    });
    self.postMessage({ type: "success", digest, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "원본 JSON을 변환하지 못했습니다.",
    });
  }
};
