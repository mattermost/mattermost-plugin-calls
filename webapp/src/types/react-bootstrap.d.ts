// React 18 removed implicit children from React.Component props.
// These overrides add children back to react-bootstrap components that need it.
import * as React from 'react';
import {TransitionCallbacks} from 'react-bootstrap';

declare module 'react-bootstrap/lib/Overlay' {
    import * as React from 'react';
    import {TransitionCallbacks} from 'react-bootstrap';

    namespace Overlay {
        interface OverlayProps extends TransitionCallbacks {
            children?: React.ReactNode;
            animation?: any;
            container?: any;
            containerPadding?: number | undefined;
            onHide?: Function | undefined;
            placement?: string | undefined;
            rootClose?: boolean | undefined;
            show?: boolean | undefined;
            target?: Function | React.ReactInstance | undefined;
            shouldUpdatePosition?: boolean | undefined;
        }
    }
    class Overlay extends React.Component<Overlay.OverlayProps> {}
    export = Overlay;
}

declare module 'react-bootstrap/lib/OverlayTrigger' {
    import * as React from 'react';

    namespace OverlayTrigger {
        interface OverlayTriggerProps {
            children?: React.ReactNode;
            overlay: any;
            animation?: any;
            container?: any;
            containerPadding?: number | undefined;
            defaultOverlayShown?: boolean | undefined;
            delay?: number | undefined;
            delayHide?: number | undefined;
            delayShow?: number | undefined;
            onEnter?: Function | undefined;
            onEntered?: Function | undefined;
            onEntering?: Function | undefined;
            onExit?: Function | undefined;
            onExited?: Function | undefined;
            onExiting?: Function | undefined;
            placement?: string | undefined;
            rootClose?: boolean | undefined;
            trigger?: string | string[] | undefined;
        }
    }
    class OverlayTrigger extends React.Component<OverlayTrigger.OverlayTriggerProps> {}
    export = OverlayTrigger;
}
