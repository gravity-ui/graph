import { Layer, LayerContext, LayerProps } from "../../services/Layer";
import { parseClassNames } from "../../utils/functions";

export interface TooltipLayerProps extends LayerProps {
  className?: string;
  zIndex?: number;
}

export class TooltipLayer extends Layer<TooltipLayerProps, LayerContext> {
  constructor(props: TooltipLayerProps) {
    super({
      html: {
        zIndex: props.zIndex ?? 300,
        classNames: ["graph-tooltip-layer", "no-pointer-events", "no-user-select"].concat(
          props.className ? parseClassNames(props.className) : []
        ),
        transformByCameraPosition: false,
      },
      ...props,
    });
  }

  public getPortalTarget(): HTMLElement | null {
    return this.getHTML();
  }
}
