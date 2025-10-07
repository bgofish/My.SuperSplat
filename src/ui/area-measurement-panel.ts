import { Button, Container, Label, Panel } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { AreaMeasurementData } from '../area-measurement-tool';

class AreaMeasurementPanel extends Panel {
    private events: Events;
    private pointsContainer: Container;
    private edgesContainer: Container;
    private areaLabel: Label;
    private clearBtn: Button;
    private closeBtn: Button;
    private exitBtn: Button;
    private visible = false;

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
        this.clearBtn = new Button({ text: 'Clear', size: 'small' });
        this.closeBtn = new Button({ text: 'Close Polygon', size: 'small' });
        this.exitBtn = new Button({ text: 'Close', size: 'small' });

        // Bind actions robustly (both PCUI and raw DOM)
        const bindBtn = (btn: Button, action: () => void) => {
            btn.on('click', action);
            const handler = (e: Event) => { e.preventDefault(); e.stopPropagation(); action(); };
            btn.dom.addEventListener('click', handler, true);
            btn.dom.addEventListener('pointerdown', handler, true);
        };
        bindBtn(this.clearBtn, () => { this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.clear'); });
        bindBtn(this.closeBtn, () => { this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.closePolygon'); });
        bindBtn(this.exitBtn, () => { this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.exit'); });

        const instructions = new Label({ text: 'Click to add points. Press "Connect" to close the polygon.', class: 'measurement-instructions' });

        const buttons = new Container({ class: 'measurement-buttons' });
        buttons.append(this.clearBtn);
        buttons.append(this.closeBtn);
        buttons.append(this.exitBtn);

        this.append(instructions);
        this.append(this.pointsContainer);
        this.append(this.edgesContainer);
        this.append(this.areaLabel);
        this.append(buttons);

        this.dom.style.display = 'none';

        this.events.on('area.measure.updated', (data: AreaMeasurementData) => this.update(data));
        this.events.on('area.measure.show', () => this.show());
        this.events.on('area.measure.hide', () => this.hide());
        this.events.on('area.measure.toggle', () => this.toggle());
    }

    private makePointRow(idx: number, p: Vec3) {
        const row = new Container({ class: 'measurement-row' });
        const label = new Label({ text: `P${idx + 1}: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`, class: 'measurement-value' });
        const redo = new Button({ text: 'Redo', size: 'small' });
        const doRedo = () => {
            this.events.fire('area.measure.disable.temporary');
            this.events.fire('area.measure.redo', idx);
        };
        redo.on('click', doRedo);
        redo.dom.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); doRedo(); }, true);
        redo.dom.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
        row.append(label);
        row.append(redo);
        return row;
    }

    private update(data: AreaMeasurementData) {
        // points
        this.pointsContainer.clear();
        data.points.forEach((p, i) => this.pointsContainer.append(this.makePointRow(i, p)));

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
    }

    toggle() { this.visible ? this.hide() : this.show(); }
    show() { if (!this.visible) { this.visible = true; this.dom.style.display = 'block'; } }
    hide() { if (this.visible) { this.visible = false; this.dom.style.display = 'none'; } }
}

export { AreaMeasurementPanel };
