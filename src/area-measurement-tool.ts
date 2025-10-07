import type { Vec3 } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';

export type AreaEdge = { a: Vec3; b: Vec3; length: number };
export type AreaMeasurementData = {
    points: Vec3[];
    edges: AreaEdge[];
    closed: boolean;
    area: number | null;
    redoIndex: number | null;
};

enum AreaState {
    INACTIVE = 0,
    ACTIVE = 1,
    WAITING_REDO = 2
}

const EPS = 1e-6;

class AreaMeasurementTool {
    private events: Events;
    private scene: Scene;

    private state: AreaState = AreaState.INACTIVE;
    private points: Vec3[] = [];
    private closed = false;

    private pointerDownHandler: (event: PointerEvent) => void;
    private pointerMoveHandler: (event: PointerEvent) => void;
    private pointerUpHandler: (event: PointerEvent) => void;
    private redoIndex: number | null = null;

    private clicksDisabled = false;
    private lastButtonClickTime = 0;
    private panelsWereHiddenBefore: boolean = false;

    // click-vs-drag detection
    private activePointerId: number | null = null;
    private downX = 0;
    private downY = 0;
    private moved = false;
    private downTime = 0;
    private staticClickMaxMs = 300; // hold longer than this = drag, not a click

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.pointerDownHandler = this.onPointerDown.bind(this);
        this.pointerMoveHandler = this.onPointerMove.bind(this);
        this.pointerUpHandler = this.onPointerUp.bind(this);
        this.bindEvents();
    }

    private bindEvents() {
        this.events.on('area.measure.toggle', () => this.toggle());
        this.events.on('area.measure.clear', () => this.clear());
        this.events.on('area.measure.exit', () => this.deactivate());
        this.events.on('area.measure.closePolygon', () => this.closePolygon());
        this.events.on('area.measure.redo', (index: number) => this.prepareRedo(index));
        this.events.on('area.measure.disable.temporary', () => this.temporarilyDisableClicks());
    }

    toggle() {
        if (this.state === AreaState.INACTIVE) this.activate();
        else this.deactivate();
    }

    activate() {
        if (this.state !== AreaState.INACTIVE) return;

        // Deactivate other tools (selection etc.)
        this.events.fire('tool.deactivate');

        this.state = AreaState.ACTIVE;
        this.points = [];
        this.closed = false;
        this.redoIndex = null;

        // Show the area measurement panel and overlay
        setTimeout(() => {
            this.events.fire('area.measure.show');
            const panel = document.querySelector('.area-measurement-panel') as HTMLElement;
            if (panel) panel.style.display = 'block';
            const overlay = document.getElementById('area-measurement-overlay') as HTMLElement;
            if (overlay) overlay.style.display = 'block';
        }, 1);

        const canvas = this.scene.canvas;
        // Ensure any previous listener is removed (both capture and bubble just in case)
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, true);
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, false);
        // Listen on the canvas (bubble phase) and do NOT stop propagation so camera can still rotate
        canvas.addEventListener('pointerdown', this.pointerDownHandler, false);
        canvas.style.cursor = 'crosshair';

        this.publish();
    }

    deactivate() {
        if (this.state === AreaState.INACTIVE) return;

        this.state = AreaState.INACTIVE;
        const canvas = this.scene.canvas;
        // Remove listeners in both phases to be safe
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, true);
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, false);
        window.removeEventListener('pointermove', this.pointerMoveHandler, true);
        window.removeEventListener('pointermove', this.pointerMoveHandler, false);
        window.removeEventListener('pointerup', this.pointerUpHandler, true);
        window.removeEventListener('pointerup', this.pointerUpHandler, false);
        this.activePointerId = null;
        canvas.style.cursor = 'default';

        // hide panel/overlay explicitly
        setTimeout(() => {
            this.events.fire('area.measure.hide');
            const panel = document.querySelector('.area-measurement-panel') as HTMLElement;
            if (panel) panel.style.display = 'none';
            const overlay = document.getElementById('area-measurement-overlay') as HTMLElement;
            if (overlay) overlay.style.display = 'none';
        }, 2);

        this.events.fire('area.measure.visual.clear');
    }

    clear() {
        this.points = [];
        this.closed = false;
        this.redoIndex = null;
        // clear overlay immediately
        this.events.fire('area.measure.visual.clear');
        this.publish();
    }

    private prepareRedo(index: number) {
        if (index >= 0 && index < this.points.length) {
            this.redoIndex = index;
            this.state = AreaState.WAITING_REDO;
            // immediately update visuals so the redo point flashes until replaced
            this.publish();
        }
    }

    private temporarilyDisableClicks() {
        this.clicksDisabled = true;
        this.lastButtonClickTime = Date.now();
        setTimeout(() => (this.clicksDisabled = false), 300);
    }

    private onPointerDown(e: PointerEvent) {
        if (this.state === AreaState.INACTIVE) return;
        if (this.clicksDisabled || Date.now() - this.lastButtonClickTime < 250) return;

        const canvas = this.scene.canvas;

        // Since we listen only on the canvas (capture), any pointer down here is for a potential click
        if (e.button !== 0) return; // left button only
        if (this.clicksDisabled || Date.now() - this.lastButtonClickTime < 250) return;

        this.activePointerId = e.pointerId;
        this.moved = false;
        const rect = canvas.getBoundingClientRect();
        this.downX = e.clientX - rect.left;
        this.downY = e.clientY - rect.top;
        this.downTime = performance.now();

        // Allow camera to handle drag; we do not stop propagation here
        // Listen in bubble phase so camera/controller (on container) still receives events first
        window.addEventListener('pointermove', this.pointerMoveHandler, false);
        window.addEventListener('pointerup', this.pointerUpHandler, false);
    }

    private onPointerMove(e: PointerEvent) {
        if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
        const canvas = this.scene.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dx = x - this.downX;
        const dy = y - this.downY;
        if (!this.moved && (dx * dx + dy * dy) > 36) { // 6px threshold
            this.moved = true;
        }
    }

    private onPointerUp(e: PointerEvent) {
        if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
        window.removeEventListener('pointermove', this.pointerMoveHandler, true);
        window.removeEventListener('pointermove', this.pointerMoveHandler, false);
        window.removeEventListener('pointerup', this.pointerUpHandler, true);
        window.removeEventListener('pointerup', this.pointerUpHandler, false);
        const canvas = this.scene.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const wasClick = !this.moved && e.button === 0 && (performance.now() - this.downTime) <= this.staticClickMaxMs;
        this.activePointerId = null;

        if (!wasClick) return; // drag - let camera control
        if (this.clicksDisabled || Date.now() - this.lastButtonClickTime < 250) return;

        const p = this.pick3DPoint(x, y);
        if (!p) return;

        if (this.state === AreaState.WAITING_REDO && this.redoIndex !== null) {
            this.points[this.redoIndex] = p;
            this.redoIndex = null;
            this.state = AreaState.ACTIVE;
        } else if (!this.closed) {
            this.points.push(p);
        }
        this.publish();
    }

    private pick3DPoint(screenX: number, screenY: number): Vec3 | null {
        // Use the measurement tool’s strategy: hijack camera.pickFocalPoint
        const camera = this.scene.camera;
        const originalSetFocalPoint = camera.setFocalPoint.bind(camera);
        const originalSetDistance = camera.setDistance.bind(camera);
        let picked: Vec3 | null = null;
        camera.setFocalPoint = (pt: Vec3) => {
            picked = pt.clone();
        };
        camera.setDistance = () => {};
        try {
            camera.pickFocalPoint(screenX, screenY);
        } catch {}
        camera.setFocalPoint = originalSetFocalPoint;
        camera.setDistance = originalSetDistance;
        return picked;
    }

    private buildEdges(): AreaEdge[] {
        const edges: AreaEdge[] = [];
        for (let i = 0; i < this.points.length - 1; i++) {
            const a = this.points[i];
            const b = this.points[i + 1];
            const len = a.clone().sub(b).length();
            if (len > EPS) edges.push({ a, b, length: len });
        }
        if (this.closed && this.points.length >= 3) {
            const a = this.points[this.points.length - 1];
            const b = this.points[0];
            const len = a.clone().sub(b).length();
            if (len > EPS) edges.push({ a, b, length: len });
        }
        return edges;
    }

    private computeArea(): number | null {
        // remove sequential duplicates to avoid 0-length edges
        const pts: Vec3[] = [];
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            if (i === 0 || p.clone().sub(this.points[i - 1]).length() > EPS) {
                pts.push(p);
            }
        }
        const n = pts.length;
        if (!this.closed || n < 3) return null;
        if (n === 3) {
            const a = pts[0].clone();
            const b = pts[1].clone().sub(a);
            const c = pts[2].clone().sub(a);
            return 0.5 * b.cross(c).length();
        }
        // Newell’s method for general simple polygon in 3D (best-fit plane for near-coplanar)
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            const q = pts[(i + 1) % n];
            nx += (p.y - q.y) * (p.z + q.z);
            ny += (p.z - q.z) * (p.x + q.x);
            nz += (p.x - q.x) * (p.y + q.y);
        }
        const areaVectorLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return areaVectorLen * 0.5;
    }

    private closePolygon() {
        if (this.points.length >= 3) {
            this.closed = true;
            this.publish();
        }
    }

    private publish() {
        const data: AreaMeasurementData = {
            points: this.points.slice(),
            edges: this.buildEdges(),
            closed: this.closed,
            area: this.computeArea(),
            redoIndex: this.state === AreaState.WAITING_REDO ? this.redoIndex : null
        };
        this.events.fire('area.measure.updated', data);
        this.events.fire('area.measure.visual.update', data);
    }
}

export { AreaMeasurementTool, AreaMeasurementData };
