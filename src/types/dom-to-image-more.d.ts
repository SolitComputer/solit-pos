declare module "dom-to-image-more" {
    interface Options {
        width?: number;
        height?: number;
        quality?: number;
        bgcolor?: string;
        style?: Record<string, string>;
        filter?: (node: Node) => boolean;
        imagePlaceholder?: string;
        cacheBust?: boolean;
    }

    function toBlob(node: Node, options?: Options): Promise<Blob>;
    function toPng(node: Node, options?: Options): Promise<string>;
    function toJpeg(node: Node, options?: Options): Promise<string>;
    function toSvg(node: Node, options?: Options): Promise<string>;
    function toCanvas(node: Node, options?: Options): Promise<HTMLCanvasElement>;

    export = {
        toBlob,
        toPng,
        toJpeg,
        toSvg,
        toCanvas,
    };
}