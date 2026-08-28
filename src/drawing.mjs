import { STUDIO_WIDTH, STUDIO_HEIGHT, mapClientPoint } from "../core.mjs";

export class DrawingBoard {
  constructor(canvas, onChange) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.onChange = onChange;
    this.tool = "pen";
    this.color = "#ffd43b";
    this.width = 8;
    this.items = [];
    this.redoItems = [];
    this.active = null;
    this.pointerId = null;
    this.bind();
    this.render();
  }

  bind() {
    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.pointerUp(event));
  }

  point(event) {
    return mapClientPoint(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), STUDIO_WIDTH, STUDIO_HEIGHT);
  }

  pointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    try { this.canvas.setPointerCapture(event.pointerId); } catch {}
    const point = this.point(event);

    if (this.tool === "text") {
      const text = window.prompt("Nhập nội dung chữ:", "");
      if (text?.trim()) {
        this.items.push({
          type: "text",
          text: text.trim(),
          x: point.x,
          y: point.y,
          color: this.color,
          width: this.width,
          fontSize: Math.max(28, this.width * 5)
        });
        this.redoItems = [];
        this.changed();
      }
      return;
    }

    if (this.tool === "eraser") {
      this.eraseAt(point);
      this.active = { type: "eraser" };
      return;
    }

    this.active = {
      type: this.tool,
      color: this.color,
      width: this.width,
      points: [point],
      start: point,
      end: point
    };
  }

  pointerMove(event) {
    if (!this.active || event.pointerId !== this.pointerId) return;
    const point = this.point(event);
    if (this.active.type === "eraser") {
      this.eraseAt(point);
      return;
    }
    this.active.end = point;
    if (["pen", "highlighter"].includes(this.active.type)) this.active.points.push(point);
    this.render();
  }

  pointerUp(event) {
    if (!this.active || (this.pointerId !== null && event.pointerId !== this.pointerId)) return;
    if (this.active.type !== "eraser") {
      const item = structuredClone(this.active);
      const moved = item.points?.length > 1 || Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y) > 2;
      if (moved) this.items.push(item);
      this.redoItems = [];
    }
    this.active = null;
    this.pointerId = null;
    this.changed();
  }

  setTool(tool) {
    this.tool = tool;
    this.canvas.style.cursor = tool === "eraser" ? "cell" : tool === "text" ? "text" : "crosshair";
  }

  setColor(color) { this.color = color; }
  setWidth(width) { this.width = Number(width) || 8; }

  eraseAt(point) {
    const radius = Math.max(22, this.width * 2.2);
    const before = this.items.length;
    this.items = this.items.filter((item) => !this.hitItem(item, point, radius));
    if (this.items.length !== before) {
      this.redoItems = [];
      this.changed();
    }
  }

  hitItem(item, point, radius) {
    if (item.type === "text") {
      return Math.abs(item.x - point.x) < radius * 3 && Math.abs(item.y - point.y) < radius * 2;
    }
    if (["rect", "line", "arrow"].includes(item.type) && item.start && item.end) {
      const minX = Math.min(item.start.x, item.end.x) - radius;
      const maxX = Math.max(item.start.x, item.end.x) + radius;
      const minY = Math.min(item.start.y, item.end.y) - radius;
      const maxY = Math.max(item.start.y, item.end.y) + radius;
      return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
    }
    const points = item.points?.length ? item.points : [item.start, item.end].filter(Boolean);
    return points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= radius);
  }

  undo() {
    if (!this.items.length) return;
    this.redoItems.push(this.items.pop());
    this.changed(false);
  }

  redo() {
    if (!this.redoItems.length) return;
    this.items.push(this.redoItems.pop());
    this.changed(false);
  }

  clear() {
    if (this.items.length && window.confirm("Xóa toàn bộ nét vẽ trên bảng?")) {
      this.redoItems.push(...this.items.splice(0));
      this.changed(false);
    }
  }

  exportScene() {
    return {
      schemaVersion: 1,
      width: STUDIO_WIDTH,
      height: STUDIO_HEIGHT,
      items: structuredClone(this.items)
    };
  }

  importScene(scene) {
    this.items = Array.isArray(scene?.items) ? structuredClone(scene.items) : [];
    this.redoItems = [];
    this.render();
  }

  changed(resetRedo = true) {
    if (resetRedo && this.active === null) this.redoItems = [];
    this.render();
    this.onChange?.(this.exportScene());
  }

  render() {
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const preview = this.active && this.active.type !== "eraser" ? [this.active] : [];
    for (const item of [...this.items, ...preview]) this.drawItem(item);
  }

  drawItem(item) {
    const context = this.context;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = item.color || "#ffd43b";
    context.fillStyle = item.color || "#ffd43b";
    context.lineWidth = item.width || 8;

    if (item.type === "highlighter") {
      context.globalAlpha = 0.3;
      context.lineWidth = (item.width || 8) * 3;
    }

    if (["pen", "highlighter"].includes(item.type)) {
      const points = item.points || [];
      if (points.length > 1) {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length - 1; index += 1) {
          const middleX = (points[index].x + points[index + 1].x) / 2;
          const middleY = (points[index].y + points[index + 1].y) / 2;
          context.quadraticCurveTo(points[index].x, points[index].y, middleX, middleY);
        }
        context.lineTo(points.at(-1).x, points.at(-1).y);
        context.stroke();
      }
    } else if (item.type === "line") {
      context.beginPath();
      context.moveTo(item.start.x, item.start.y);
      context.lineTo(item.end.x, item.end.y);
      context.stroke();
    } else if (item.type === "arrow") {
      const angle = Math.atan2(item.end.y - item.start.y, item.end.x - item.start.x);
      const head = Math.max(22, (item.width || 8) * 4);
      context.beginPath();
      context.moveTo(item.start.x, item.start.y);
      context.lineTo(item.end.x, item.end.y);
      context.stroke();
      context.beginPath();
      context.moveTo(item.end.x, item.end.y);
      context.lineTo(item.end.x - head * Math.cos(angle - Math.PI / 6), item.end.y - head * Math.sin(angle - Math.PI / 6));
      context.lineTo(item.end.x - head * Math.cos(angle + Math.PI / 6), item.end.y - head * Math.sin(angle + Math.PI / 6));
      context.closePath();
      context.fill();
    } else if (item.type === "rect") {
      context.strokeRect(item.start.x, item.start.y, item.end.x - item.start.x, item.end.y - item.start.y);
    } else if (item.type === "text") {
      context.font = `800 ${item.fontSize || 42}px Inter, system-ui, sans-serif`;
      context.textBaseline = "top";
      String(item.text).split("\n").forEach((line, index) => {
        context.fillText(line, item.x, item.y + index * (item.fontSize || 42) * 1.18);
      });
    }
    context.restore();
  }
}
