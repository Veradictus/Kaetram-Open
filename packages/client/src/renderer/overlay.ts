import log from '../lib/log';

export default class Overlay {
    public currentOverlay: string | null = null;
    private overlays: { [key: string]: HTMLImageElement } = {};

    public constructor() {
        this.load();
    }

    private async load(): Promise<void> {
        this.overlays.fog = await this.loadOverlay('fog');
    }

    private async loadOverlay(overlayName: string): Promise<HTMLImageElement> {
        const overlay = new Image();

        overlay.crossOrigin = 'Anonymous';
        const { default: image } = await import(`../../img/overlays/${overlayName}.png`);
        overlay.src = image;

        overlay.addEventListener('load', () => log.debug(`Loaded ${overlayName}`));

        return overlay;
    }

    public updateOverlay(overlay: string): void {
        this.currentOverlay = overlay;
    }

    public getFog(): string | null {
        return this.currentOverlay;
    }
}
