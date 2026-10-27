/// <reference lib="webworker" />
import { convertLocalFile } from './convert-local-file';
self.onmessage = async (event: MessageEvent<{ text: string; fileName: string }>) => {
  try {
    const { text, fileName } = event.data;
    self.postMessage({ type: 'success', ...await convertLocalFile(text, fileName) });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : '원본 JSON을 변환하지 못했습니다.',
    });
  }
};
