import $ from 'jquery';

export default abstract class Page {
    private body: JQuery;
    public loaded = false;

    protected constructor(element: string) {
        this.body = $(element);
    }

    public show(): void {
        this.body.fadeIn('slow');
    }

    public hide(): void {
        this.body.fadeOut('slow');
    }

    public isVisible(): boolean {
        return this.body.css('display') === 'block';
    }

    public resize(): void {
        // not implemented
    }

    public async getImageFormat(name: string): Promise<string> {
        const { default: image } = await import(`../../../img/sprites/item-${name}.png`);

        return `url("${image}")`;
    }
}
