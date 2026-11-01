export function createStage(canvas: HTMLCanvasElement, getState: () => any, callbacks?: {
  onSelect?: (id: string) => void; onMove?: (id: string, x: number, y: number) => void;
  onClick?: (obj: any) => void; onError?: (message: string) => void;
}): { draw(): void; clearInput(): void; destroy(): void };
