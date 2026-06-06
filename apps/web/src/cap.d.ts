/**
 * Ambient types for the Cap.js widget (no published types). This file must stay
 * free of top-level import/export so the declarations remain ambient/global.
 */

// The widget bundle self-registers the <cap-widget> custom element on import.
declare module "@cap.js/widget/cap.min.js";

// Augment React's JSX with the custom element (React 19 uses React.JSX).
declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      "cap-widget": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "data-cap-api-endpoint"?: string;
        },
        HTMLElement
      >;
    }
  }
}
