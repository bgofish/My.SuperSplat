import { Button, Container, Label, Panel } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { AreaMeasurementData } from '../area-measurement-tool';

class AreaMeasurementPanel extends Panel {
    private events: Events;
    private pointsContainer: Container;
    private edgesContainer: Container;
    private areaLabel: Label;
    private planarityLabel: Label;
    private splitResultLabel: Label;
    private clearBtn: Button;
    private closeBtn: Button;
    private exitBtn: Button;
    private ridgeToggleBtn: Button;
    private visible = false;
    private splitMode = false;
    private lastData: AreaMeasurementData | null = null;

    constructor(events: Events) {
        super({
            id: 'area-measurement-panel',
            class: ['measurement-panel', 'area-measurement-panel'],
            headerText: 'AREA MEASUREMENT TOOL',
            collapsible: false,
            collapsed: false,
            removable: false
        });
        this.events = events;
        this.pointsContainer = new Container({ class: 'area-points-container' });
        this.edgesContainer = new Container({ class: 'area-edges-container' });
        this.areaLabel = new Label({ text: 'Area: ---', class: 'measurement-value' });
        this.planarityLabel = new Label({ text: '', class: 'measurement-value' });
        this.splitResultLabel = new Label({ text: '', class: 'measurement-value' });
        this.clearBtn = new Button({ text: 'Clear', size: 'small' });
        this.ridgesContainer = new Container({ class: 'area-ridges' });
        this.closeBtn = new Button({ text: 'Close Polygon', size: 'small' });
        this.exitBtn = new Button({ text: 'Close', size: 'small' });
        this.ridgeToggleBtn = new Button({ text: 'Start Ridges', size: 'small' });

        // Bind actions robustly (both PCUI and raw DOM)
        const bindBtn = (btn: Button, action: () => void) => {
            btn.on('click', action);
            const handler = (e: Event) => { e.preventDefault(); e.stopPropagation(); action(); };
            btn.dom.addEventListener('click', handler, true);
            btn.dom.addEventListener('pointerdown', handler, true);
        };
        bindBtn(this.clearBtn, () => {
            this.events.fire('area.measure.disable.temporary');
            // reset split UI immediately for clarity
            if (this.splitMode) {
                this.splitMode = false;
                this.updateSplitButtons();
            }
            this.ridgeToggleBtn.text = 'Start Ridges';
            this.events.fire('area.measure.ridge.stop');
            this.events.fire('area.measure.split.cancel');
            this.events.fire('area.measure.clear');
        });
        bindBtn(this.closeBtn, () => { this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.closePolygon'); });
        bindBtn(this.exitBtn, () => { this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.exit'); });
        // Single toggle to add ridges continuously
        this.ridgeToggleBtn.on('click', () => {
            this.events.fire('area.measure.disable.temporary');
            this.splitMode = !this.splitMode;
            if (this.splitMode) {
                this.ridgeToggleBtn.text = 'Stop Ridges';
                this.events.fire('area.measure.ridge.start');
            } else {
                this.ridgeToggleBtn.text = 'Start Ridges';
                this.events.fire('area.measure.ridge.stop');
            }
            this.updateSplitButtons();
            if (this.lastData) this.update(this.lastData);
        });

        const instructions = new Label({ text: 'Click to add points. Press "Connect" to close the polygon.', class: 'measurement-instructions' });

        const ridgeButtons = new Container({ class: 'measurement-buttons' });
        const addRidgeBtn = new Button({ text: 'Add Ridge', size: 'small' });
        const undoRidgeBtn = new Button({ text: 'Undo Ridge', size: 'small' });
        const clearRidgesBtn = new Button({ text: 'Clear Ridges', size: 'small' });
        ridgeButtons.append(addRidgeBtn);
        ridgeButtons.append(undoRidgeBtn);
        ridgeButtons.append(clearRidgesBtn);
        // Toggle auto-add mode on Add Ridge
        let addingAuto = false;
        addRidgeBtn.on('click', () => {
            this.events.fire('area.measure.disable.temporary');
            if (!this.splitMode) {
                this.splitMode = true;
                this.updateSplitButtons();
            }
            addingAuto = !addingAuto;
            if (addingAuto) {
                addRidgeBtn.text = 'Stop Adding';
                this.events.fire('area.measure.ridge.start');
            } else {
                addRidgeBtn.text = 'Add Ridge';
                this.events.fire('area.measure.ridge.stop');
            }
        });
        undoRidgeBtn.on('click', () => { this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.split.undo'); });
        clearRidgesBtn.on('click', () => { this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.split.clearAll'); });

        const buttons = new Container({ class: 'measurement-buttons' });
        buttons.append(this.clearBtn);
        buttons.append(this.closeBtn);
        buttons.append(this.ridgeToggleBtn);
        buttons.append(this.exitBtn);

        this.append(instructions);
        // prevent panel clicks from reaching canvas without blocking child controls
        // use non-capturing listeners so target (buttons) still receive the event
        (this.dom as HTMLElement).addEventListener('pointerdown', (e) => { e.stopPropagation(); }, false);
        (this.dom as HTMLElement).addEventListener('click', (e) => { e.stopPropagation(); }, false);
        this.append(this.pointsContainer);
        this.append(this.edgesContainer);
        this.append(this.areaLabel);
        this.append(this.planarityLabel);
        this.append(this.splitResultLabel);
        this.append(this.ridgesContainer);
        this.append(ridgeButtons);
        this.append(buttons);

        this.dom.style.display = 'none';

        this.events.on('area.measure.updated', (data: AreaMeasurementData) => this.update(data));
        this.events.on('area.measure.show', () => this.show());
        this.events.on('area.measure.hide', () => this.hide());
        this.events.on('area.measure.show', () => this.show());
        // keep a copy of last data to force immediate re-render when toggling
        this.events.on('area.measure.updated', (d: AreaMeasurementData) => { this.lastData = d; });
        // keep UI split mode in sync if tool cancels split (e.g., after clear)
        this.events.on('area.measure.split.cancel', () => {
            if (this.splitMode) {
                this.splitMode = false;
                this.ridgeToggleBtn.text = 'Start Ridges';
                this.updateSplitButtons();
                this.splitResultLabel.text = '';
                if (this.lastData) this.update(this.lastData);
            }
        });
        this.events.on('area.measure.ridge.stop', () => {
            if (this.splitMode) {
                this.splitMode = false;
                this.ridgeToggleBtn.text = 'Start Ridges';
                this.updateSplitButtons();
                if (this.lastData) this.update(this.lastData);
            }
        });
    }

    private makePointRow(idx: number, p: Vec3, used: Set<number>, selected: Set<number>) {
        const row = new Container({ class: 'measurement-row' });
        const label = new Label({ text: `P${idx + 1}: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`, class: 'measurement-value' });
        const redo = new Button({ text: 'Redo', size: 'small' });
        const pick = new Button({ text: 'Pick', size: 'small' });
        const doRedo = () => {
            this.events.fire('area.measure.disable.temporary');
            this.events.fire('area.measure.redo', idx);
        };
        const doPick = () => {
            if (!this.splitMode) return;
            this.events.fire('area.measure.disable.temporary');
            this.events.fire('area.measure.split.select', idx);
        };
        redo.on('click', doRedo);
        pick.on('click', doPick);
        // color-code Pick button: selected -> yellow, used in ridge -> cyan
        if (selected.has(idx)) pick.dom.style.background = '#ffd400';
        else if (used.has(idx)) pick.dom.style.background = '#00bcd4';
        pick.dom.style.color = '#000';
        redo.dom.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); doRedo(); }, true);
        pick.dom.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); doPick(); }, true);
        redo.dom.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
        pick.dom.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
        row.append(label);
        row.append(redo);
        if (this.splitMode) row.append(pick);
        return row;
    }

    private update(data: AreaMeasurementData) {
        // points
        this.pointsContainer.clear();
        const used = new Set((data.ridges ?? []).flatMap(r => [r.i, r.j]));
        const selected = new Set((data.splitSelection ?? []));
        data.points.forEach((p, i) => this.pointsContainer.append(this.makePointRow(i, p, used, selected)));

        // edges (render as simple labels without boxed container)
        this.edgesContainer.clear();
        data.edges.forEach((e, i) => {
            const lbl = new Label({ text: `L${i + 1}: ${e.length.toFixed(3)}`, class: 'area-edge-label' });
            this.edgesContainer.append(lbl);
        });

        // area
        if (data.area !== null) {
            this.areaLabel.text = `Area: ${data.area.toFixed(3)}`;
        } else {
            this.areaLabel.text = 'Area: ---';
        }

        // planarity
        if (data.nonPlanarity && (data.nonPlanarity.max > 0.2)) {
            this.planarityLabel.text = `Non-planar: max ${data.nonPlanarity.max.toFixed(3)}, rms ${data.nonPlanarity.rms.toFixed(3)}`;
        } else if (data.nonPlanarity) {
            this.planarityLabel.text = `Planarity OK (max ${data.nonPlanarity.max.toFixed(3)})`;
        } else {
            this.planarityLabel.text = '';
        }

        // ridges list
        this.lastData = data;
        this.ridgesContainer.clear();
        if (data.ridges && data.ridges.length) {
            data.ridges.forEach((r, idx) => {
                const lbl = new Label({ text: `R${idx + 1}: P${r.i + 1} ↔ P${r.j + 1}` , class: 'measurement-value' });
                this.ridgesContainer.append(lbl);
            });
        }
        if (data.surfaces && data.surfaces.length) {
            data.surfaces.forEach((s, idx) => {
                const lbl = new Label({ text: `S${idx + 1}: ${s.area.toFixed(3)} (indices ${s.indices.map(i=>`P${i+1}`).join('→')})`, class: 'measurement-value' });
                this.ridgesContainer.append(lbl);
            });
            if (data.surfacesTotal !== null) {
                const sumLbl = new Label({ text: `Surfaces total: ${data.surfacesTotal.toFixed(3)}`, class: 'measurement-value' });
                this.ridgesContainer.append(sumLbl);
            }
        }

        // split results
        if (data.splitAreas) {
            this.splitResultLabel.text = `Split areas: ${data.splitAreas.a.toFixed(3)} + ${data.splitAreas.b.toFixed(3)} = ${data.splitAreas.total.toFixed(3)}`;
            // leave split mode once we have results
            this.splitMode = false;
            this.updateSplitButtons();
        } else if (this.splitMode) {
            const sel = data.splitSelection || [];
            if (sel.length === 1) this.splitResultLabel.text = `Pick second point (selected P${sel[0] + 1})...`;
            else this.splitResultLabel.text = 'Pick two points to split the polygon...';
        } else {
            this.splitResultLabel.text = '';
        }
    }

    private updateSplitButtons() {
        // currently handled by ridgeToggleBtn label; nothing else to show/hide
    }

    toggle() { this.visible ? this.hide() : this.show(); }
    show() { if (!this.visible) { this.visible = true; this.dom.style.display = 'block'; this.updateSplitButtons(); } }
    hide() {
        if (this.visible) {
            this.visible = false;
            this.dom.style.display = 'none';
            // reset ridge/split UI state and notify tool to cancel any split selection
            if (this.splitMode) {
                this.splitMode = false;
                this.updateSplitButtons();
            }
            this.ridgeToggleBtn.text = 'Start Ridges';
            this.splitResultLabel.text = '';
            this.planarityLabel.text = '';
            this.events.fire('area.measure.ridge.stop');
            this.events.fire('area.measure.split.cancel');
        }
    }
}

export { AreaMeasurementPanel };
