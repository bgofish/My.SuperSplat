import { Vec3 } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';
import { AreaMeasurementData } from './area-measurement-tool';

class AreaMeasurementVisual {
    private scene: Scene;
    private events: Events;
    private canvas: HTMLCanvasElement;
    private overlay: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private data: AreaMeasurementData | null = null;
    private raf: number | null = null;

    constructor(events: Events, scene: Scene, canvas: HTMLCanvasElement) {
        this.events = events;
        this.scene = scene;
        this.canvas = canvas;
        this.overlay = document.createElement('canvas');
        this.overlay.id = 'area-measurement-overlay';
        this.overlay.style.position = 'absolute';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.pointerEvents = 'none';
        this.overlay.style.zIndex = '999';
        const parent = this.canvas.parentElement!;
        parent.appendChild(this.overlay);
        this.ctx = this.overlay.getContext('2d')!;
        this.resizeToCanvas();
        window.addEventListener('resize', () => this.resizeToCanvas());

        this.events.on('area.measure.visual.update', (d: AreaMeasurementData) => {
            this.data = d;
            this.ensureAnimating();
        });
        this.events.on('area.measure.visual.clear', () => {
            this.data = null;
            this.stop();
            this.clear();
        });
    }

    private resizeToCanvas() {
        const r = this.canvas.getBoundingClientRect();
        this.overlay.width = r.width;
        this.overlay.height = r.height;
        this.overlay.style.width = `${r.width}px`;
        this.overlay.style.height = `${r.height}px`;
    }

    private ensureAnimating() {
        if (this.raf !== null) return;
        const step = () => {
            if (this.data) {
                this.render();
                this.raf = requestAnimationFrame(step);
            } else {
                this.raf = null;
            }
        };
        this.raf = requestAnimationFrame(step);
    }

    private stop() {
        if (this.raf !== null) cancelAnimationFrame(this.raf);
        this.raf = null;
    }

    private clear() {
        this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }

    private w2s(p: Vec3) {
        const screen = new Vec3();
        this.scene.camera.worldToScreen(p, screen);
        return { x: screen.x, y: screen.y };
    }

    private drawPoint(x: number, y: number, color: string) {
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    private drawLine(x1: number, y1: number, x2: number, y2: number) {
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.restore();
    }

    private drawLabel(x: number, y: number, text: string) {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - ctx.measureText(text).width / 2 - 4, y - 16, ctx.measureText(text).width + 8, 14);
        ctx.fillStyle = '#00d1ff';
        ctx.fillText(text, x, y - 2);
        ctx.restore();
    }

    private render() {
        if (!this.data) return;
        this.resizeToCanvas();
        this.clear();
        const pts = this.data.points.map(p => this.w2s(p));

        // Fill closed polygon with translucent blue tint (draw first for layering)
        if (this.data.closed && pts.length >= 3) {
            const ctx = this.ctx;
            ctx.save();
            ctx.globalAlpha = 0.15; // faint transparency
            ctx.fillStyle = '#00d1ff'; // blue-ish tint
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // draw lines and labels
        for (let i = 0; i < this.data.edges.length; i++) {
            const e = this.data.edges[i];
            const a = this.w2s(e.a); const b = this.w2s(e.b);
            this.drawLine(a.x, a.y, b.x, b.y);
            this.drawLabel((a.x + b.x) / 2, (a.y + b.y) / 2, `${e.length.toFixed(3)}`);
        }
        // flashing color for redo point (oscillate between red and blue)
        const redoIndex = this.data.redoIndex;
        const t = performance.now() * 0.002; // speed factor
        const s = (Math.sin(t * Math.PI * 2) + 1) * 0.5; // 0..1
        const r = Math.round(255 * s);
        const bcol = Math.round(255 * (1 - s));
        const flashColor = `rgb(${r},0,${bcol})`;
        // draw points
        pts.forEach((p, i) => {
            const defaultColor = i === 0 ? '#0f0' : '#f00';
            const color = (redoIndex !== null && i === redoIndex) ? flashColor : defaultColor;
            this.drawPoint(p.x, p.y, color);
        });
        // area label at centroid if closed
        if (this.data.closed && pts.length >= 3 && this.data.area !== null) {
            const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
            this.drawLabel(cx, cy, `Area: ${this.data.area.toFixed(3)}`);
        }
    }
}

export { AreaMeasurementVisual };
